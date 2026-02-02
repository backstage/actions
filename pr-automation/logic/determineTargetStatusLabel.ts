export interface StatusDecisionInput {
  labels: Set<string>;
  statusLabels: Set<string>;
  defaultStatusLabel: string;
  needsDecisionLabel: string;
  needsChangesLabel: string;
  awaitingMergeLabel: string;
  needsReviewLabel: string;
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED';
  // Only used to detect manual status label changes
  labelAdded?: string;
}

/**
 * Determines the target status label for a PR based on its current state.
 * Uses GitHub's reviewDecision which reflects the branch protection rules.
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

  // Use GitHub's review decision which reflects branch protection rules
  switch (input.reviewDecision) {
    case 'CHANGES_REQUESTED':
      return input.needsChangesLabel;
    case 'APPROVED':
      return input.awaitingMergeLabel;
    default:
      return input.needsReviewLabel;
  }
}
