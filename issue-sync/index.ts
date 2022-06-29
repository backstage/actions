import * as core from '@actions/core';
import * as github from '@actions/github';
import { mkLog } from '../lib/mkLog';
import { syncIssueLabels } from './syncIssueLabels';

async function main() {
  core.info(`Running issue-sync!`);
  const token = core.getInput('github-token', { required: true });
  const client = github.getOctokit(token);
  const repoInfo = github.context.repo;

  await Promise.all([
    syncIssueLabels(
      client,
      {
        ...repoInfo,
        issueNumber: github.context.issue.number,
        issueTitle: github.context.payload.issue?.title,
      },
      mkLog('sync-issue-labels'),
    ),
  ]);
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
