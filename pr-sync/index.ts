import * as core from '@actions/core';
import * as github from '@actions/github';
import { mkLog } from '../lib/mkLog';
import { approveRenovatePRs } from './approveRenovatePRs';
import { syncProjectBoard } from './syncProjectBoard';
import { createAppClient } from '../lib/createAppClient';
import { randomAssign } from './randomAssign';
import { getPrOwner } from './getPrOwner';

async function main() {
  const action = github.context.payload.action;
  const eventName = github.context.eventName;
  const issueNumber = github.context.issue.number;
  const actor = github.context.actor;
  const author = github.context.payload.pull_request?.user?.login;

  core.info(
    `PR sync #${issueNumber} ${eventName}/${action} actor=${actor} author=${author}`,
  );
  core.info(`context: ${JSON.stringify(github.context, null, 2)}`);

  const projectId = core.getInput('project-id', { required: true });
  const excludedUsers = core.getInput('excluded-users', { required: false });
  const owningTeams = core.getInput('owning-teams', { required: false });

  const client = createAppClient();

  const owningTeam = await getPrOwner(
    client,
    {
      ...github.context.repo,
      issueNumber: github.context.issue.number,
      owningTeams,
    },
    mkLog('get-pr-owner'),
  );
  core.info(`PR is owned by ${owningTeam ?? 'maintainers'}`);

  const commonOptions = {
    ...github.context.repo,
    action,
    eventName,
    issueNumber,
    projectId,
    actor,
    author,
    excludedUsers,
    owningTeam,
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
