import * as core from '@actions/core';
import * as github from '@actions/github';
import { Repository, Project, Organization } from '@octokit/graphql-schema';

interface Options {
  owner: string;
  repo: string;
  issueNumber: number;
  projectId: string;
  action?: string;
}

export async function syncProjectBoard(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  if (['opened', 'reopened'].includes(options.action!)) {
    await addToBoard(client, options, log);
  }
  if (options.action === 'closed') {
    await removeFromBoard(client, options, log);
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

  await client.graphql(
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
