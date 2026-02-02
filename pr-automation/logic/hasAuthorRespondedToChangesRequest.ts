import { Review, Comment } from '../types';

/**
 * Checks if the PR author has commented after the most recent "changes requested" review.
 * This is used to determine if a PR should be pushed back to the review queue.
 */
export function hasAuthorRespondedToChangesRequest(
  reviews: Review[],
  comments: Comment[],
  authorLogin?: string,
): boolean {
  if (!authorLogin) {
    return false;
  }

  // Find the most recent CHANGES_REQUESTED review
  const changesRequestedReviews = reviews.filter(
    r => r.state === 'CHANGES_REQUESTED' && r.submittedAt,
  );
  if (changesRequestedReviews.length === 0) {
    return false;
  }

  const mostRecentChangesRequest = changesRequestedReviews.reduce(
    (latest, review) =>
      !latest || review.submittedAt! > latest.submittedAt! ? review : latest,
  );

  // Find the most recent comment by the author
  const authorComments = comments.filter(
    c => c.authorLogin === authorLogin && c.createdAt,
  );
  if (authorComments.length === 0) {
    return false;
  }

  const mostRecentAuthorComment = authorComments.reduce((latest, comment) =>
    !latest || comment.createdAt! > latest.createdAt! ? comment : latest,
  );

  // Check if the author's comment is more recent than the changes request
  return (
    mostRecentAuthorComment.createdAt! > mostRecentChangesRequest.submittedAt!
  );
}
