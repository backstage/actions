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

export async function removeFromBoard(
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

  log(`Found items: ${JSON.stringify(items)}`);

  const item = items.find(i => i?.project?.number === options.boardNumber);
  log(`Selected item: ${JSON.stringify(item)}`);
  if (!item) {
    return;
  }

  const res = await client.graphql<{ repository?: Repository }>(
    `
mutation {
  deleteProjectV2Item(input:{ projectId: $projectId, itemId: $itemId }) {
    deletedItemId
  }
}`,
    { projectId: item.project.id, itemId: item.id },
  );
  log(`Delete response: ${JSON.stringify(res)}`);
}
