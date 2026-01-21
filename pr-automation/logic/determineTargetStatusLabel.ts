import { Review } from '../types';

export interface StatusDecisionInput {
  eventName: string;
  action?: string;
  labels: Set<string>;
  statusLabels: Set<string>;
  defaultStatusLabel: string;
  needsDecisionLabel: string;
  needsChangesLabel: string;
  awaitingMergeLabel: string;
  needsReviewLabel: string;
  authorLogin?: string;
  actor?: string;
  labelAdded?: string;
  labelRemoved?: string;
  reviewState?: string;
  commentAuthor?: { login?: string; type?: string };
  reviews: Review[];
}

export function determineTargetStatusLabel(
  input: StatusDecisionInput,
): string | null {
  if (input.eventName === 'pull_request' && input.action === 'labeled') {
    if (input.labelAdded && input.statusLabels.has(input.labelAdded)) {
      return input.labelAdded;
    }
  }

  if (input.eventName === 'pull_request' && input.action === 'unlabeled') {
    if (input.labelRemoved && input.statusLabels.has(input.labelRemoved)) {
      return input.defaultStatusLabel;
    }
  }

  if (
    input.labels.has(input.needsDecisionLabel) &&
    !(input.eventName === 'pull_request' && input.action === 'labeled')
  ) {
    return null;
  }

  if (input.labels.has(input.needsChangesLabel)) {
    const isAuthorAction =
      (input.eventName === 'issue_comment' &&
        input.commentAuthor?.login === input.authorLogin) ||
      (input.eventName === 'pull_request' &&
        input.action === 'synchronize' &&
        input.actor === input.authorLogin);

    if (isAuthorAction) {
      return input.needsReviewLabel;
    }
  }

  if (input.eventName === 'pull_request_review') {
    if (input.action === 'dismissed') {
      const hasChangesRequested = input.reviews.some(
        review => review.state === 'CHANGES_REQUESTED',
      );
      const hasApprovals = input.reviews.some(
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

    const state = input.reviewState ?? '';
    if (state === 'CHANGES_REQUESTED') {
      return input.needsChangesLabel;
    }
    if (state === 'APPROVED') {
      const hasChangesRequested = input.reviews.some(
        review => review.state === 'CHANGES_REQUESTED',
      );
      if (hasChangesRequested) {
        return input.needsChangesLabel;
      }
      return input.awaitingMergeLabel;
    }
  }

  if (input.eventName === 'pull_request') {
    if (
      input.action === 'opened' ||
      input.action === 'synchronize' ||
      input.action === 'reopened'
    ) {
      const hasChangesRequested = input.reviews.some(
        review => review.state === 'CHANGES_REQUESTED',
      );
      const hasApprovals = input.reviews.some(
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
  }

  if (input.eventName === 'issue_comment') {
    if (input.commentAuthor?.type !== 'Bot') {
      const hasChangesRequested = input.reviews.some(
        review => review.state === 'CHANGES_REQUESTED',
      );
      if (hasChangesRequested) {
        return input.needsChangesLabel;
      }
    }
  }

  return null;
}
