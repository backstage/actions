import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  ProjectV2ItemFieldSingleSelectValue,
  ProjectV2SingleSelectField,
  Repository,
  UpdateProjectV2ItemFieldValuePayload,
} from '@octokit/graphql-schema';

export async function getBoardStatus(
  client: ReturnType<typeof github.getOctokit>,
  options: {
    owner: string;
    repo: string;
    issueNumber: number;
    projectId: string;
  },
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

export async function maybeSetReReviewStatus(
  client: ReturnType<typeof github.getOctokit>,
  options: {
    owner: string;
    repo: string;
    issueNumber: number;
    projectId: string;
  },
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
