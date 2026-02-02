import { Review } from '../types';

export function shouldHaveReviewerApprovedLabel(
  reviews: Review[],
  reviewerLogins: Set<string>,
): boolean {
  const reviewerApprovals = reviews.filter(
    review =>
      normalizeReviewState(review.state) === 'APPROVED' &&
      (review.authorLogin ? reviewerLogins.has(review.authorLogin) : false),
  );
  // Any change request (from anyone, not just reviewers) trumps reviewer approval.
  // This ensures that outstanding issues are addressed before the label is applied.
  const changesRequested = reviews.filter(
    review => normalizeReviewState(review.state) === 'CHANGES_REQUESTED',
  );

  const latestApproval = getLatestReview(reviewerApprovals);
  const latestChangesRequested = getLatestReview(changesRequested);

  if (latestApproval && latestChangesRequested) {
    return (
      new Date(latestApproval.submittedAt ?? 0) >
      new Date(latestChangesRequested.submittedAt ?? 0)
    );
  }

  return Boolean(latestApproval);
}

function normalizeReviewState(state: string): string {
  const normalized = state.toUpperCase();
  return normalized;
}

function getLatestReview(reviews: Review[]) {
  if (reviews.length === 0) {
    return undefined;
  }
  return reviews.reduce((latest, review) => {
    const latestDate = new Date(latest.submittedAt ?? 0);
    const reviewDate = new Date(review.submittedAt ?? 0);
    return reviewDate > latestDate ? review : latest;
  });
}
