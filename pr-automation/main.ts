import * as core from '@actions/core';
import { collectInput } from './collectInput';
import { applyOutput, removeFromProjectBoard } from './applyOutput';
import { getConfig } from './getConfig';
import { determineTargetStatusLabel } from './logic/determineTargetStatusLabel';
import { estimateTotalAdditions } from './logic/estimateTotalAdditions';
import { calculateSizeLabel } from './logic/calculateSizeLabel';
import { calculatePriority } from './logic/calculatePriority';
import { shouldHaveReviewerApprovedLabel } from './logic/shouldHaveReviewerApprovedLabel';
import { planLabelChanges } from './logic/planLabelChanges';
import { shouldUnassignStaleReview } from './logic/shouldUnassignStaleReview';
import {
  updateReviewerScoreLedger,
  getReviewerScore,
} from './reviewerScoreLedger';
import { hasAuthorRespondedToChangesRequest } from './logic/hasAuthorRespondedToChangesRequest';
import { shouldAutoAssignReviewer } from './logic/shouldAutoAssignReviewer';

export async function main() {
  const config = getConfig();
  const input = await collectInput(config);
  if (!input) {
    core.info('No pull request found in event payload, skipping');
    return;
  }

  const { event, data, reviewerLogins, maintainerLogins } = input;

  core.info(
    `Processing PR #${data.number} by ${data.authorLogin}: "${data.title}" (${
      event.eventName
    }/${event.action ?? 'n/a'})`,
  );

  // Handle PR closed by non-bot: remove from project board and skip processing
  if (event.action === 'closed' && !event.actor.endsWith('[bot]')) {
    core.info(`PR closed by ${event.actor}, removing from project board`);
    await removeFromProjectBoard(input);
    return;
  }

  // Log collected input
  core.startGroup('Collected Input');
  core.info(`Event: ${event.eventName}/${event.action ?? 'n/a'}`);
  core.info(`Actor: ${event.actor}`);
  if (event.labelAdded) {
    core.info(`Label added: ${event.labelAdded}`);
  }
  core.info(`Labels: [${data.labels.join(', ')}]`);
  core.info(`Assignees: [${data.assignees.join(', ') || 'none'}]`);
  core.info(`Files: ${data.filesTotalCount} total`);
  core.info(
    `Reviews: ${
      data.latestReviews.length > 0
        ? data.latestReviews
            .map(r => `${r.authorLogin ?? 'unknown'}:${r.state}`)
            .join(', ')
        : 'none'
    }`,
  );
  if (data.mostRecentAssignmentAt) {
    const ageDays = Math.floor(
      (Date.now() - new Date(data.mostRecentAssignmentAt).getTime()) /
        (24 * 60 * 60 * 1000),
    );
    core.info(`Most recent assignment: ${ageDays} days ago`);
  }
  if (data.projectItem) {
    const statusValue = data.projectItem.fieldValues.find(
      f => f.fieldName === config.statusFieldName,
    )?.value;
    const priorityValue = data.projectItem.fieldValues.find(
      f => f.fieldName === config.priorityFieldName,
    )?.value;
    core.info(
      `Project: status="${statusValue ?? 'unset'}", priority=${
        priorityValue ?? 'unset'
      }`,
    );
  } else {
    core.info('Project: not on board');
  }
  core.endGroup();

  // Compute decisions
  core.startGroup('Computing Output');

  // Size calculation
  const additionsEstimate = estimateTotalAdditions(
    data.files,
    data.filesTotalCount,
    config.ignorePatterns,
  );
  const sizeLabel = calculateSizeLabel(additionsEstimate.additions);
  core.info(
    `Size: ${additionsEstimate.additions} additions${
      additionsEstimate.estimated ? ' (estimated)' : ''
    } → ${sizeLabel}`,
  );

  // Reviewer approved calculation
  const existingLabels = new Set(data.labels);
  let reviewerApproved = existingLabels.has(config.reviewerApprovedLabel);
  if (reviewerLogins) {
    reviewerApproved = shouldHaveReviewerApprovedLabel(
      data.reviews,
      reviewerLogins,
    );
    core.info(
      `Reviewer approved: ${reviewerApproved} (based on ${reviewerLogins.size} team members)`,
    );
  } else {
    core.info(`Reviewer approved: keeping existing (reviewer team not accessible)`);
  }

  // Status label calculation
  const statusLabels = new Set(Object.keys(config.statusLabelMap));

  // Check if the author has responded after the most recent changes request
  // (either by commenting or pushing new commits)
  const authorHasRespondedToChangesRequest = hasAuthorRespondedToChangesRequest(
    data.reviews,
    data.comments,
    data.authorLogin,
    data.headCommitDate,
  );

  const targetStatusLabel = determineTargetStatusLabel({
    labels: existingLabels,
    statusLabels,
    defaultStatusLabel: config.defaultStatusLabel,
    needsDecisionLabel: config.needsDecisionLabel,
    needsChangesLabel: config.needsChangesLabel,
    awaitingMergeLabel: config.awaitingMergeLabel,
    needsReviewLabel: config.needsReviewLabel,
    reviewDecision: data.reviewDecision,
    labelAdded: event.labelAdded,
    authorHasRespondedToChangesRequest,
  });

  if (event.labelAdded && statusLabels.has(event.labelAdded)) {
    core.info(`Status: ${targetStatusLabel} (manually set via label)`);
  } else if (existingLabels.has(config.needsDecisionLabel)) {
    core.info(`Status: keeping existing (needs-decision label present)`);
  } else if (
    data.reviewDecision === 'CHANGES_REQUESTED' &&
    authorHasRespondedToChangesRequest
  ) {
    core.info(
      `Status: ${targetStatusLabel} (author responded to changes request)`,
    );
  } else {
    core.info(
      `Status: ${targetStatusLabel} (reviewDecision: ${
        data.reviewDecision ?? 'none'
      })`,
    );
  }

  // Priority calculation
  const authorScore = data.authorLogin
    ? await getReviewerScore(input.client, event.owner, data.authorLogin)
    : 0;

  const priority = calculatePriority({
    additions: additionsEstimate.additions,
    priorityParams: config.priorityParams,
    reviewerApproved,
    authorScore,
    reviews: data.reviews,
    isDraft: data.isDraft,
    checkRuns: data.checkRuns,
    requiredChecks: config.requiredChecks,
  });

  // Stale review check
  const hasWaitingForReviewLabel = existingLabels.has(config.needsReviewLabel);
  const shouldUnassign = shouldUnassignStaleReview({
    hasWaitingForReviewLabel,
    assignees: data.assignees,
    mostRecentAssignmentAt: data.mostRecentAssignmentAt,
  });

  if (!hasWaitingForReviewLabel) {
    core.info('Stale review: no (not waiting for review)');
  } else if (data.assignees.length === 0) {
    core.info('Stale review: no (no assignees)');
  } else if (!data.mostRecentAssignmentAt) {
    core.info('Stale review: no (no assignment timestamp)');
  } else {
    const ageDays = Math.floor(
      (Date.now() - new Date(data.mostRecentAssignmentAt).getTime()) /
        (24 * 60 * 60 * 1000),
    );
    core.info(
      `Stale review: ${
        shouldUnassign ? 'yes' : 'no'
      } (assigned ${ageDays} days ago, threshold: 14 days)`,
    );
  }

  // Auto-assign reviewer on changes_requested
  const autoAssign = shouldAutoAssignReviewer({
    reviewState: event.reviewState,
    reviewerLogin: event.actor,
    assignees: data.assignees,
    maintainerLogins,
  });
  const assignReviewer = autoAssign ? event.actor : undefined;

  if (assignReviewer) {
    core.info(`Auto-assign reviewer: ${assignReviewer}`);
  } else if (event.reviewState === 'changes_requested') {
    core.info(
      `Auto-assign reviewer: no (${
        data.assignees.length > 0
          ? 'PR already has assignees'
          : 'reviewer is not a maintainer'
      })`,
    );
  }

  // Plan label changes
  const sizeLabelSet = new Set(config.sizeLabels.map(s => s.label));
  const labelPlan = planLabelChanges({
    existingLabels,
    sizeLabel,
    sizeLabelSet,
    reviewerApprovedLabel: config.reviewerApprovedLabel,
    reviewerApproved,
    statusLabels,
    targetStatusLabel,
    defaultStatusLabel: config.defaultStatusLabel,
  });

  core.endGroup();

  // Log computed output
  core.startGroup('Computed Output');
  core.info(
    `Labels to add: [${
      Array.from(labelPlan.labelsToAdd).join(', ') || 'none'
    }]`,
  );
  core.info(
    `Labels to remove: [${
      Array.from(labelPlan.labelsToRemove).join(', ') || 'none'
    }]`,
  );
  core.info(`Status to sync: ${labelPlan.statusLabelToSync ?? 'none'}`);
  core.info(`Priority: ${priority}`);
  core.info(`Unassign stale reviewers: ${shouldUnassign}`);
  if (assignReviewer) {
    core.info(`Assign reviewer: ${assignReviewer}`);
  }
  core.endGroup();

  await applyOutput(input, {
    labelPlan,
    priority,
    shouldUnassign,
    assignReviewer,
  });

  await updateReviewerScoreLedger(input, reviewerLogins);
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
