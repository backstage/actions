import * as core from '@actions/core';
import * as github from '@actions/github';
import { mkLog } from '../lib/mkLog';
import { approveRenovatePRs } from './approveRenovatePRs';
import { syncProjectBoard } from './syncProjectBoard';
import { createAppClient } from '../lib/createAppClient';
import { randomAssign } from './randomAssign';

async function main() {
  core.info(`Running pr-sync!`);
  const boardNumberStr = core.getInput('board-number', { required: true });
  const excludedUsers = core.getInput('excluded-users', { required: false });
  const client = createAppClient();

  const boardNumber = parseInt(boardNumberStr, 10);
  if (Number.isNaN(boardNumber)) {
    core.setFailed(`Invalid board number: ${boardNumberStr}`);
    return;
  }

  const commonOptions = {
    ...github.context.repo,
    action: github.context.payload.action,
    issueNumber: github.context.issue.number,
    boardNumber,
    actor: github.context.actor,
    excludedUsers,
  };

  await Promise.all([
    syncProjectBoard(client, commonOptions, mkLog('approve-renovate-prs')),
    randomAssign(client, commonOptions, mkLog('random-assign')),
    approveRenovatePRs(client, commonOptions, mkLog('approve-renovate-prs')),
  ]);
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
