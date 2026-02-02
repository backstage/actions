import { Review, Comment } from '../types';

/**
 * Checks if the PR author has responded after the most recent "changes requested" review,
 * either by commenting or by pushing new commits.
 * This is used to determine if a PR should be pushed back to the review queue.
 */
export function hasAuthorRespondedToChangesRequest(
  reviews: Review[],
  comments: Comment[],
  authorLogin?: string,
  headCommitDate?: string,
): boolean {
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

  // Check if the head commit is more recent than the changes request
  if (
    headCommitDate &&
    headCommitDate > mostRecentChangesRequest.submittedAt!
  ) {
    return true;
  }

  // Check if the author has commented more recently than the changes request
  if (authorLogin) {
    const authorComments = comments.filter(
      c => c.authorLogin === authorLogin && c.createdAt,
    );

    if (authorComments.length > 0) {
      const mostRecentAuthorComment = authorComments.reduce((latest, comment) =>
        !latest || comment.createdAt! > latest.createdAt! ? comment : latest,
      );

      if (
        mostRecentAuthorComment.createdAt! >
        mostRecentChangesRequest.submittedAt!
      ) {
        return true;
      }
    }
  }

  return false;
}
