import * as github from '@actions/github';
import { Repository } from '@octokit/graphql-schema';

export async function approveRenovatePRs(
  client: ReturnType<typeof github.getOctokit>,
  options: { owner: string; repo: string; issueNumber: number; actor: string },
  log = console.log,
  waitTimeMs = 2000,
) {
  const { actor, owner, repo, issueNumber } = options;

  if (actor !== 'renovate[bot]') {
    return;
  }

  const { data } = await client.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: issueNumber,
  });

  if (data.some(f => f.filename.split('/').slice(-1)[0] !== 'yarn.lock')) {
    log('skipping approval since some files are not yarn.lock');
    return;
  }

  await client.rest.pulls.createReview({
    owner,
    repo,
    pull_number: issueNumber,
    event: 'APPROVE',
  });
}
