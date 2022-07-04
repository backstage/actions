import * as core from '@actions/core';
import * as github from '@actions/github';

interface Options {
  owner: string;
  repo: string;
  issueNumber: number;
  eventName: string;
  actor: string;
  action?: string;
}

export async function approveRenovatePRs(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
  waitTimeMs = 2000,
) {
  const { actor, owner, repo, issueNumber, action } = options;

  if (options.eventName !== 'pull_request_target') {
    return;
  }
  if (action === 'closed') {
    return;
  }

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
