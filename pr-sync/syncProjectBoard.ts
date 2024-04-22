import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  Repository,
  ProjectV2SingleSelectField,
} from '@octokit/graphql-schema';
import { maybeSetReReviewStatus } from '../lib/board';
import {
  addPullRequestToProjectBoard,
  getProjectV2Fields,
  getPullRequestNodeId,
  getPullRequestProjectV2ItemId,
  updateProjectV2FieldValue,
} from '../lib/graphql';

interface Options {
  owner: string;
  repo: string;
  issueNumber: number;
  eventName: string;
  projectId: string;
  action?: string;
  author?: string;
  actor: string;
  owningTeam?: string;
}

export async function syncProjectBoard(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  if (!options.projectId) {
    log('No project ID provided, skipping project board sync');
    return;
  }

  if (options.eventName === 'pull_request_target') {
    if (['opened', 'reopened'].includes(options.action!)) {
      await addToBoard(client, options, log);
    }
    if (options.action === 'closed') {
      await removeFromBoard(client, options, log);
    }
    if (options.action === 'synchronize') {
      await maybeSetReReviewStatus(client, options, log);
      await updateChangedTimestamp(client, options, log);
    }
  } else if (
    options.eventName === 'issue_comment' ||
    options.eventName === 'pull_request_review_comment'
  ) {
    if (options.actor === options.author) {
      await maybeSetReReviewStatus(client, options, log);
    }
  }
}

async function addToBoard(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  log(`Adding PR ${options.issueNumber} to board ${options.projectId}`);

  const { nodeId: pullRequestNodeId } = await getPullRequestNodeId(
    client,
    options,
  );

  const { itemId } = await addPullRequestToProjectBoard(client, {
    projectId: options.projectId,
    pullRequestNodeId,
  });

  const fields = await getProjectV2Fields(client, options);
  const addedField = fields?.find(field => field?.name === 'Added');
  if (!addedField) {
    throw new Error('Could not find "Added" field');
  }
  const changedField = fields?.find(field => field?.name === 'Changed');
  if (!changedField) {
    throw new Error('Could not find "Changed" field');
  }

  const timestampText = new Date().toISOString().replace('T', ' ').slice(0, -5);

  await Promise.all([
    updateProjectV2FieldValue(client, {
      projectId: options.projectId,
      fieldId: addedField?.id,
      itemId,
      value: { text: timestampText },
    }),
    updateProjectV2FieldValue(client, {
      projectId: options.projectId,
      fieldId: changedField?.id,
      itemId,
      value: { text: timestampText },
    }),
  ]);

  if (options.owningTeam) {
    log(
      `Marking item ${itemId} as external as PR is owned by ${options.owningTeam}`,
    );

    const statusField = fields?.find(field => field?.name === 'Status');
    if (!statusField) {
      throw new Error(
        `Unable to find status field in ${JSON.stringify(fields, null, 2)}`,
      );
    }

    const optionField = (
      statusField as ProjectV2SingleSelectField
    ).options.find(o => o.name === 'External');
    if (!optionField) {
      throw new Error(
        `Unable to find option 'External', got ${JSON.stringify(
          statusField,
          null,
          2,
        )}`,
      );
    }

    await updateProjectV2FieldValue(client, {
      projectId: options.projectId,
      fieldId: statusField.id,
      itemId,
      value: { singleSelectOptionId: optionField.id },
    });
  }
}

async function removeFromBoard(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  log(`Removing issue ${options.issueNumber} from board ${options.projectId}`);

  const { itemId } = await getPullRequestProjectV2ItemId(client, options);
  log(`Project board item is ${itemId ?? 'missing'}`);
  if (!itemId) {
    return;
  }

  await client.graphql<{ repository?: Repository }>(
    `
mutation($projectId: ID!, $itemId: ID!) {
  deleteProjectV2Item(input:{ projectId: $projectId, itemId: $itemId }) {
    deletedItemId
  }
}`,
    { projectId: options.projectId, itemId },
  );
}

async function updateChangedTimestamp(
  client: ReturnType<typeof github.getOctokit>,
  options: Options,
  log = core.info,
) {
  const { itemId } = await getPullRequestProjectV2ItemId(client, options);
  if (!itemId) {
    log(
      `PR #${options.issueNumber} is not in the project board, skipping update of changed timestamp`,
    );
    return;
  }

  const fields = await getProjectV2Fields(client, options);
  const changedField = fields?.find(field => field?.name === 'Changed');
  if (!changedField) {
    throw new Error('Could not find "Changed" field');
  }

  await updateProjectV2FieldValue(client, {
    projectId: options.projectId,
    fieldId: changedField?.id,
    itemId,
    value: { text: new Date().toISOString().replace('T', ' ').slice(0, -5) },
  });
}
