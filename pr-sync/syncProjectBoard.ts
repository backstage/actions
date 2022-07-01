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
  log(`Adding PR ${options.issueNumber} to board ${options.boardNumber}`);
  const prLookup = await client.graphql<{
    repository?: Repository;
    organization?: Organization;
  }>(
    `
    query($owner: String!, $repo: String!, $issueNumber: Int!){
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          id
        }
      }
      organization(login: $owner) {
        projectsV2(first: 10) {
          nodes {
            id
            number
          }
        }
      }
    }`,
    { ...options },
  );

  const project = prLookup.organization?.projectsV2?.nodes?.find(
    p => p?.number === options.boardNumber,
  );
  if (!project) {
    throw new Error(
      `No project was found for board number ${options.boardNumber}`,
    );
  }

  const prId = prLookup.repository?.pullRequest?.id;
  if (!prId) {
    throw new Error(`Failed to look up PR ID for ${options.issueNumber}`);
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
      projectId: project.id,
      contentId: prId,
    },
  );
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
