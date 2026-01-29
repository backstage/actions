import { shouldUnassignStaleReview } from './shouldUnassignStaleReview';

describe('shouldUnassignStaleReview', () => {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  it('should return false if PR does not have waiting-for:review label', () => {
    expect(
      shouldUnassignStaleReview({
        hasWaitingForReviewLabel: false,
        assignees: ['user1'],
        mostRecentAssignmentAt: threeWeeksAgo,
      }),
    ).toBe(false);
  });

  it('should return false if PR has no assignees', () => {
    expect(
      shouldUnassignStaleReview({
        hasWaitingForReviewLabel: true,
        assignees: [],
        mostRecentAssignmentAt: threeWeeksAgo,
      }),
    ).toBe(false);
  });

  it('should return false if assignment happened less than two weeks ago', () => {
    expect(
      shouldUnassignStaleReview({
        hasWaitingForReviewLabel: true,
        assignees: ['user1'],
        mostRecentAssignmentAt: oneWeekAgo,
      }),
    ).toBe(false);
  });

  it('should return false if assignment timestamp is not available', () => {
    expect(
      shouldUnassignStaleReview({
        hasWaitingForReviewLabel: true,
        assignees: ['user1'],
        mostRecentAssignmentAt: undefined,
      }),
    ).toBe(false);
  });

  it('should return true if assignment happened exactly two weeks ago', () => {
    expect(
      shouldUnassignStaleReview({
        hasWaitingForReviewLabel: true,
        assignees: ['user1'],
        mostRecentAssignmentAt: twoWeeksAgo,
      }),
    ).toBe(true);
  });

  it('should return true if assignment happened more than two weeks ago', () => {
    expect(
      shouldUnassignStaleReview({
        hasWaitingForReviewLabel: true,
        assignees: ['user1', 'user2'],
        mostRecentAssignmentAt: threeWeeksAgo,
      }),
    ).toBe(true);
  });
});
