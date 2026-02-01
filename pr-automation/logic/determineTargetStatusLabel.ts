import { LatestReview } from '../types';

export interface StatusDecisionInput {
  labels: Set<string>;
  statusLabels: Set<string>;
  defaultStatusLabel: string;
  needsDecisionLabel: string;
  needsChangesLabel: string;
  awaitingMergeLabel: string;
  needsReviewLabel: string;
  latestReviews: LatestReview[];
  // Only used to detect manual status label changes
  labelAdded?: string;
}

/**
 * Determines the target status label for a PR based on its current state.
 * This is trigger-agnostic - it computes the correct status based on PR state,
 * not on what event triggered the automation.
 */
export function determineTargetStatusLabel(
  input: StatusDecisionInput,
): string | null {
  // If a status label was just manually added, respect that choice
  if (input.labelAdded && input.statusLabels.has(input.labelAdded)) {
    return input.labelAdded;
  }

  // If needs-decision label is present, don't change status automatically
  // This is a manual override that indicates maintainer attention is needed
  if (input.labels.has(input.needsDecisionLabel)) {
    return null;
  }

  // Compute status based on review state
  const hasChangesRequested = input.latestReviews.some(
    review => review.state === 'CHANGES_REQUESTED',
  );
  const hasApprovals = input.latestReviews.some(
    review => review.state === 'APPROVED',
  );

  if (hasChangesRequested) {
    return input.needsChangesLabel;
  }
  if (hasApprovals) {
    return input.awaitingMergeLabel;
  }
  return input.needsReviewLabel;
}
