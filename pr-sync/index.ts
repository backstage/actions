import * as core from '@actions/core';
import * as github from '@actions/github';
import { mkLog } from '../lib/mkLog';
import { approveRenovatePRs } from './approveRenovatePRs';
import { syncProjectBoard } from './syncProjectBoard';

async function main() {
  core.info(`Running pr-sync!`);
  const token = core.getInput('github-token', { required: true });
  const boardNumberStr = core.getInput('board-number', { required: true });
  const client = github.getOctokit(token);
  const repoInfo = github.context.repo;
  const action = github.context.payload.action;

  const boardNumber = parseInt(boardNumberStr, 10);
  if (Number.isNaN(boardNumber)) {
    core.setFailed(`Invalid board number: ${boardNumberStr}`);
    return;
  }

  const promises = [
    syncProjectBoard(
      client,
      {
        ...repoInfo,
        issueNumber: github.context.issue.number,
        boardNumber,
        action,
      },
      mkLog('approve-renovate-prs'),
    ),
  ];

  if (action !== 'closed') {
    promises.push(
      approveRenovatePRs(
        client,
        {
          ...repoInfo,
          issueNumber: github.context.issue.number,
          actor: github.context.actor,
        },
        mkLog('approve-renovate-prs'),
      ),
    );
  }

  await Promise.all(promises);
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
