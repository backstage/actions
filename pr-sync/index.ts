import * as core from '@actions/core';
import * as github from '@actions/github';
import { mkLog } from '../lib/mkLog';
import { approveRenovatePRs } from './approveRenovatePRs';
import { syncProjectBoard } from './syncProjectBoard';
import { createAppClient } from '../lib/createAppClient';
import { randomAssign } from './randomAssign';
import { getPrOwner } from './getPrOwner';

async function main() {
  core.info(`Running pr-sync!`);
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
    action: github.context.payload.action,
    issueNumber: github.context.issue.number,
    projectId,
    actor: github.context.actor,
    author: github.context.payload.pull_request?.user?.login,
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
