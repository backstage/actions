import * as core from '@actions/core';
import { collectInput } from './collectInput';
import { applyOutput } from './applyOutput';
import type { AutomationInput } from './types';
import { getConfig } from './getConfig';
import { determineTargetStatusLabel } from './logic/determineTargetStatusLabel';
import { estimateTotalAdditions } from './logic/estimateTotalAdditions';
import { calculateSizeLabel } from './logic/calculateSizeLabel';
import { calculatePriority } from './logic/calculatePriority';
import { shouldHaveReviewerApprovedLabel } from './logic/shouldHaveReviewerApprovedLabel';
import { planLabelChanges } from './logic/planLabelChanges';
import { shouldUnassignStaleReview } from './logic/shouldUnassignStaleReview';

export async function main() {
  const config = getConfig();
  const input = await collectInput(config);
  if (!input) {
    core.info('No pull request found in event payload, skipping');
    return;
  }

  const event = input.event;
  const data = input.data;
  const reviewerLogins = input.reviewerLogins;
  const reviewerTeamMissing = input.reviewerTeamMissing;
  core.info(
    `PR automation for #${event.issueNumber} ${event.eventName}/${
      event.action ?? 'n/a'
    }`,
  );

  const additionsEstimate = estimateTotalAdditions(
    data.files,
    data.filesTotalCount,
    config.ignorePatterns,
  );
  core.info(
    `${additionsEstimate.estimated ? 'Estimated' : 'Counted'} ${
      additionsEstimate.additions
    } additions across ${additionsEstimate.totalFiles} files`,
  );

  const sizeLabel = calculateSizeLabel(additionsEstimate.additions);
  const existingLabels = new Set(data.labels);
  let reviewerApproved = existingLabels.has(config.reviewerApprovedLabel);
  if (reviewerTeamMissing) {
    core.info(
      `Reviewer team ${config.reviewerTeamOrg}/${config.reviewerTeamSlug} not accessible, skipping reviewer-approved sync`,
    );
  } else if (reviewerLogins) {
    reviewerApproved = shouldHaveReviewerApprovedLabel(
      data.reviews,
      reviewerLogins,
    );
  }

  const statusLabels: Set<string> = new Set(Object.keys(config.statusLabelMap));

  // [DEBUG] Log inputs to determineTargetStatusLabel
  core.info(
    `[DEBUG] determineTargetStatusLabel inputs: eventName=${
      event.eventName
    }, action=${event.action ?? 'none'}, reviewState=${
      event.reviewState ?? 'none'
    }`,
  );
  core.info(
    `[DEBUG] determineTargetStatusLabel: latestReviews count=${
      data.latestReviews.length
    }, states=[${data.latestReviews.map(r => r.state).join(', ')}]`,
  );
  core.info(
    `[DEBUG] determineTargetStatusLabel: existing status labels=[${Array.from(
      existingLabels,
    )
      .filter(l => statusLabels.has(l))
      .join(', ')}]`,
  );

  const targetStatusLabel = determineTargetStatusLabel({
    eventName: event.eventName,
    action: event.action,
    labels: existingLabels,
    statusLabels,
    defaultStatusLabel: config.defaultStatusLabel,
    needsDecisionLabel: config.needsDecisionLabel,
    needsChangesLabel: config.needsChangesLabel,
    awaitingMergeLabel: config.awaitingMergeLabel,
    needsReviewLabel: config.needsReviewLabel,
    authorLogin: data.authorLogin,
    actor: event.actor,
    labelAdded: event.labelAdded,
    labelRemoved: event.labelRemoved,
    reviewState: event.reviewState,
    commentAuthor: event.commentAuthor,
    latestReviews: data.latestReviews,
  });

  core.info(
    `[DEBUG] determineTargetStatusLabel result: ${targetStatusLabel ?? 'null'}`,
  );

  const sizeLabelSet: Set<string> = new Set(
    config.sizeLabels.map(sizeLabel => sizeLabel.label),
  );
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

  const priority = calculatePriority(
    additionsEstimate.additions,
    config.priorityParams,
    reviewerApproved,
  );

  // [DEBUG] Log stale review unassignment decision
  const hasWaitingForReviewLabel = existingLabels.has(config.needsReviewLabel);
  core.info(
    `[DEBUG] Stale review check: hasWaitingForReviewLabel=${hasWaitingForReviewLabel}, assignees=[${data.assignees.join(
      ', ',
    )}], mostRecentAssignmentAt=${data.mostRecentAssignmentAt ?? 'none'}`,
  );

  const shouldUnassign = shouldUnassignStaleReview({
    hasWaitingForReviewLabel,
    assignees: data.assignees,
    mostRecentAssignmentAt: data.mostRecentAssignmentAt,
  });

  core.info(
    `[DEBUG] Stale review unassignment decision: shouldUnassign=${shouldUnassign}`,
  );

  // [DEBUG] Log label plan details
  core.info(
    `[DEBUG] Label plan: add=[${Array.from(labelPlan.labelsToAdd).join(
      ', ',
    )}], remove=[${Array.from(labelPlan.labelsToRemove).join(
      ', ',
    )}], statusLabelToSync=${labelPlan.statusLabelToSync ?? 'none'}`,
  );
  core.info(`[DEBUG] Priority: ${priority}`);

  await applyOutput(input, { labelPlan, priority, shouldUnassign });
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
