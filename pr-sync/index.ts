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
  const author = (
    github.context.payload.pull_request ?? github.context.payload.issue
  )?.user?.login as string | undefined;

  core.info(
    `PR sync #${issueNumber} ${eventName}/${action} actor=${actor} author=${author}`,
  );

  const projectId = core.getInput('project-id', { required: false });
  const excludedUsers = core.getInput('excluded-users', { required: false });
  const owningTeams = core.getInput('owning-teams', { required: false });
  const token = core.getInput('github-token', { required: true });
  const shouldAutoAssign =
    core.getBooleanInput('auto-assign', { required: false }) ?? true;

  const userClient = github.getOctokit(token);
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

  const actions = [
    syncProjectBoard(client, commonOptions, mkLog('sync-project-board')),
    approveRenovatePRs(
      userClient,
      commonOptions,
      mkLog('approve-renovate-prs'),
    ),
  ];

  if (shouldAutoAssign) {
    actions.push(randomAssign(client, commonOptions, mkLog('random-assign')));
  }

  await Promise.all(actions);
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
