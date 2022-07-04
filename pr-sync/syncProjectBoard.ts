import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  Repository,
  Organization,
  AddProjectV2ItemByIdPayload,
  UpdateProjectV2ItemFieldValuePayload,
  ProjectV2,
  ProjectV2SingleSelectField,
  ProjectV2ItemFieldSingleSelectValue,
} from '@octokit/graphql-schema';
import { REVIEWERS } from './randomAssign';

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
    }
  } else if (
    options.eventName === 'issue_comment' ||
    options.eventName === 'pull_request_review_comment'
  ) {
    if (options.actor === 'PR_AUTHOR') {
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
  const prLookup = await client.graphql<{
    repository?: Repository;
    organization?: Organization;
  }>(
    `
    query($owner: String!, $repo: String!, $issueNumber: Int!){
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $issueNumber) {
          id
        }
      }
    }`,
    { ...options },
  );

  const prId = prLookup.repository?.pullRequest?.id;
  if (!prId) {
    throw new Error(`Failed to look up PR ID for #${options.issueNumber}`);
  }

  const addedItem = await client.graphql<{
    addProjectV2ItemById?: AddProjectV2ItemByIdPayload;
  }>(
    `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {
        projectId: $projectId,
        contentId: $contentId,
      }) {
        item {
          id
        }
      }
    }
  `,
    {
      projectId: options.projectId,
      contentId: prId,
    },
  );

  if (options.owningTeam) {
    const itemId = addedItem.addProjectV2ItemById?.item?.id;
    if (!itemId) {
      throw new Error(`Adding board item did not return an item ID`);
    }
    log(
      `Marking item ${itemId} as external as PR is owned by ${options.owningTeam}`,
    );

    const projectInfo = await client.graphql<{ node?: ProjectV2 }>(
      `
      query ($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 100) {
              nodes {
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
      }`,
      { projectId: options.projectId },
    );

    const statusField = projectInfo.node?.fields?.nodes?.find(
      field => field?.name === 'Status',
    );
    if (!statusField) {
      throw new Error(
        `Unable to find status field, got ${JSON.stringify(
          projectInfo,
          null,
          2,
        )}`,
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
        itemId,
        projectId: options.projectId,
        fieldId: statusField.id,
        optionId: optionField.id,
      },
    );
  }
}

async function removeFromBoard(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  log(`Removing issue ${options.issueNumber} from board ${options.projectId}`);

  const data = await client.graphql<{ organization?: Organization }>(
    `
query ($owner: String!, $repo: String!, $issueNumber: Int!) {
  organization(login: $owner) {
    repository(name: $repo) {
      pullRequest(number: $issueNumber) {
        id
        title
        projectItems(first: 10) {
          nodes {
            id
            project {
              id
            }
          }
        }
      }
    }
  }
}`,
    { ...options },
  );

  const items =
    data.organization?.repository?.pullRequest?.projectItems?.nodes ?? [];

  const item = items.find(i => i?.project?.id === options.projectId);
  log(`Project board item is ${JSON.stringify(item)}`);
  if (!item) {
    return;
  }

  await client.graphql<{ repository?: Repository }>(
    `
mutation($projectId: ID!, $itemId: ID!) {
  deleteProjectV2Item(input:{ projectId: $projectId, itemId: $itemId }) {
    deletedItemId
  }
}`,
    { projectId: item.project.id, itemId: item.id },
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
