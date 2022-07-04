import * as github from '@actions/github';
import {
  AddProjectV2ItemByIdPayload,
  ProjectV2,
  ProjectV2FieldConfiguration,
  ProjectV2FieldValue,
  Repository,
  UpdateProjectV2ItemFieldValuePayload,
} from '@octokit/graphql-schema';

export async function getPullRequestNodeId(
  client: ReturnType<typeof github.getOctokit>,
  options: { owner: string; repo: string; issueNumber: number },
): Promise<{ nodeId: string }> {
  const prLookup = await client.graphql<{
    repository?: Repository;
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

  const nodeId = prLookup.repository?.pullRequest?.id;
  if (!nodeId) {
    throw new Error(`Failed to look up PR ID for #${options.issueNumber}`);
  }

  return { nodeId };
}

export async function addPullRequestToProjectBoard(
  client: ReturnType<typeof github.getOctokit>,
  options: { projectId: string; pullRequestNodeId: string },
): Promise<{ itemId: string }> {
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
      contentId: options.pullRequestNodeId,
    },
  );

  const itemId = addedItem.addProjectV2ItemById?.item?.id;
  if (!itemId) {
    throw new Error(`Adding board item did not return an item ID`);
  }

  return { itemId };
}

export async function getProjectV2Fields(
  client: ReturnType<typeof github.getOctokit>,
  options: { projectId: string },
): Promise<ProjectV2FieldConfiguration[] | undefined> {
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
              ... on ProjectV2Field {
                id
                name
              }
            }
          }
        }
      }
    }`,
    { projectId: options.projectId },
  );

  return (projectInfo.node?.fields?.nodes ?? undefined) as
    | ProjectV2FieldConfiguration[]
    | undefined;
}

export async function updateProjectV2FieldValue(
  client: ReturnType<typeof github.getOctokit>,
  options: {
    projectId: string;
    itemId: string;
    fieldId: string;
    value: ProjectV2FieldValue;
  },
): Promise<void> {
  await client.graphql<{
    updateProjectV2ItemFieldValue: UpdateProjectV2ItemFieldValuePayload;
  }>(
    `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId,
          itemId: $itemId,
          fieldId: $fieldId,
          value: $value
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
  `,
    {
      projectId: options.projectId,
      itemId: options.itemId,
      fieldId: options.fieldId,
      value: options.value,
    },
  );
}
