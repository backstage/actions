import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  Repository,
  Organization,
  UpdateProjectV2ItemFieldValuePayload,
  ProjectV2SingleSelectField,
  ProjectV2ItemFieldSingleSelectValue,
} from '@octokit/graphql-schema';
import {
  addPullRequestToProjectBoard,
  getProjectV2Fields,
  getPullRequestNodeId,
  getPullRequestProjectV2ItemId,
  updateProjectV2FieldValue,
} from '../lib/graphql';

interface Options {
  owner: string;
  repo: string;
  issueNumber: number;
  eventName: string;
  projectId: string;
  action?: string;
  author?: string;
  actor: string;
  owningTeam?: string;
}

export async function syncProjectBoard(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  if (options.eventName === 'pull_request_target') {
    if (['opened', 'reopened'].includes(options.action!)) {
      await addToBoard(client, options, log);
    }
    if (options.action === 'closed') {
      await removeFromBoard(client, options, log);
    }
    if (options.action === 'synchronize') {
      await maybeSetReReviewStatus(client, options, log);
      await updateChangedTimestamp(client, options, log);
    }
  } else if (
    options.eventName === 'issue_comment' ||
    options.eventName === 'pull_request_review_comment'
  ) {
    if (options.actor === options.author) {
      await maybeSetReReviewStatus(client, options, log);
    }
  }
}

async function addToBoard(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  log(`Adding PR ${options.issueNumber} to board ${options.projectId}`);

  const { nodeId: pullRequestNodeId } = await getPullRequestNodeId(
    client,
    options,
  );

  const { itemId } = await addPullRequestToProjectBoard(client, {
    projectId: options.projectId,
    pullRequestNodeId,
  });

  const fields = await getProjectV2Fields(client, options);
  const addedField = fields?.find(field => field?.name === 'Added');
  if (!addedField) {
    throw new Error('Could not find "Added" field');
  }

  await updateProjectV2FieldValue(client, {
    projectId: options.projectId,
    fieldId: addedField?.id,
    itemId,
    value: { text: new Date().toISOString().replace('T', ' ').slice(0, -5) },
  });

  if (options.owningTeam) {
    log(
      `Marking item ${itemId} as external as PR is owned by ${options.owningTeam}`,
    );

    const statusField = fields?.find(field => field?.name === 'Status');
    if (!statusField) {
      throw new Error(
        `Unable to find status field in ${JSON.stringify(fields, null, 2)}`,
      );
    }

    const optionField = (
      statusField as ProjectV2SingleSelectField
    ).options.find(o => o.name === 'External');
    if (!optionField) {
      throw new Error(
        `Unable to find option 'External', got ${JSON.stringify(
          statusField,
          null,
          2,
        )}`,
      );
    }

    await updateProjectV2FieldValue(client, {
      projectId: options.projectId,
      fieldId: statusField.id,
      itemId,
      value: { singleSelectOptionId: optionField.id },
    });
  }
}

async function removeFromBoard(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  log(`Removing issue ${options.issueNumber} from board ${options.projectId}`);

  const { itemId } = await getPullRequestProjectV2ItemId(client, options);
  log(`Project board item is ${itemId ?? 'missing'}`);
  if (!itemId) {
    return;
  }

  await client.graphql<{ repository?: Repository }>(
    `
mutation($projectId: ID!, $itemId: ID!) {
  deleteProjectV2Item(input:{ projectId: $projectId, itemId: $itemId }) {
    deletedItemId
  }
}`,
    { projectId: options.projectId, itemId },
  );
}

async function getBoardStatus(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
): Promise<
  undefined | { current?: string; setStatus(name: string): Promise<void> }
> {
  const { owner, repo, issueNumber } = options;
  const projectInfo = await client.graphql<{ repository?: Repository }>(
    `
    query ($owner: String!, $repo: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $issueNumber) {
          id
          projectItems(first: 100) {
            nodes {
              id
              project {
                id
              }
              fieldValues(first: 100) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                        options {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { owner, repo, issueNumber },
  );

  const projectItem =
    projectInfo.repository?.pullRequest?.projectItems?.nodes?.find(
      item => item?.project.id === options.projectId,
    );
  if (!projectItem) {
    log(`PR #${issueNumber} does not have a matching project ID, skipping`);
    return;
  }

  const fieldValue = projectItem.fieldValues?.nodes?.find(
    value => value?.field?.name === 'Status',
  ) as ProjectV2ItemFieldSingleSelectValue | undefined;
  if (!fieldValue) {
    throw new Error(`PR #${issueNumber} does not have a Status field!`);
  }
  const field = fieldValue.field as ProjectV2SingleSelectField | undefined;
  return {
    current: fieldValue.name ?? undefined,
    async setStatus(name: string) {
      const optionId = field?.options.find(option => option.name === name)?.id;
      if (!optionId) {
        throw new Error(`${name} is not a valid option for the Status field!`);
      }

      await client.graphql<{
        updateProjectV2ItemFieldValue: UpdateProjectV2ItemFieldValuePayload;
      }>(
        `
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(
            input: {
              projectId: $projectId,
              itemId: $itemId,
              fieldId: $fieldId,
              value: {
                singleSelectOptionId: $optionId
              }
            }
          ) {
            projectV2Item {
              id
            }
          }
        }
      `,
        {
          itemId: projectItem.id,
          projectId: options.projectId,
          fieldId: fieldValue.field.id,
          optionId,
        },
      );
    },
  };
}

async function maybeSetReReviewStatus(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  const status = await getBoardStatus(client, options, log);

  if (status?.current === 'Changes Requested') {
    log(`Setting PR #${options.issueNumber} board status to "Re-Review`);
    await status.setStatus('Re-Review');
  } else {
    log(
      `Current board status for PR #${options.issueNumber} is ${
        status?.current ?? 'none'
      }`,
    );
  }
}

async function updateChangedTimestamp(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  const { itemId } = await getPullRequestProjectV2ItemId(client, options);
  if (!itemId) {
    log(
      `PR #${options.issueNumber} is not in the project board, skipping update of changed timestamp`,
    );
    return;
  }

  const fields = await getProjectV2Fields(client, options);
  const changedField = fields?.find(field => field?.name === 'Changed');
  if (!changedField) {
    throw new Error('Could not find "Changed" field');
  }

  await updateProjectV2FieldValue(client, {
    projectId: options.projectId,
    fieldId: changedField?.id,
    itemId,
    value: { text: new Date().toISOString().replace('T', ' ').slice(0, -5) },
  });
}
