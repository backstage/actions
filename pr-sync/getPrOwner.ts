import * as core from '@actions/core';
import * as github from '@actions/github';
import { Repository } from '@octokit/graphql-schema';
import * as codeowners from 'codeowners-utils';

interface Options {
  owner: string;
  repo: string;
  issueNumber: number;
  owningTeams?: string;
}

export async function getPrOwner(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  const owningTeams = options.owningTeams?.split(',').map(t => t.trim()) ?? [];
  if (owningTeams.length === 0) {
    return undefined;
  }

  const data = await client.graphql<{ repository?: Repository }>(
    `
    query($owner: String!, $repo: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        object(expression: "HEAD:.github/CODEOWNERS") {
          ... on Blob {
            text
          }
        }
        pullRequest(number: $issueNumber) {
          id
          files(first: 100) {
            nodes {
              path
            }
          }
        }
      }
    }
     `,
    { ...options },
  );

  const ownersContent = (data.repository?.object as { text?: string }).text;
  if (!ownersContent) {
    log(`No code owners available`);
    return undefined;
  }
  const ownerDefinitions = codeowners.parse(ownersContent);

  const filesChanged =
    data.repository?.pullRequest?.files?.nodes
      ?.map(f => f?.path)
      .filter((path): path is string => Boolean(path)) ?? [];

  const fileOwners = filesChanged.map(
    path => codeowners.matchFile(path, ownerDefinitions)?.owners,
  );

  for (const team of owningTeams) {
    if (fileOwners.every(owners => owners?.includes(team))) {
      return team;
    }
  }

  return undefined;
}
