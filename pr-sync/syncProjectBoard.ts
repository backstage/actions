import * as core from '@actions/core';
import * as github from '@actions/github';
import { Repository, Project, Organization } from '@octokit/graphql-schema';

interface Options {
  owner: string;
  repo: string;
  issueNumber: number;
  boardNumber: number;
  action?: string;
}

export async function syncProjectBoard(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  if (options.action === 'closed') {
    await removeFromBoard(client, options, log);
  }
}

async function removeFromBoard(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  log(
    `Removing issue ${options.issueNumber} from board ${options.boardNumber}`,
  );

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
              number
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

  const item = items.find(i => i?.project?.number === options.boardNumber);
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
