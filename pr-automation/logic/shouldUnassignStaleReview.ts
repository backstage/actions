const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export function shouldUnassignStaleReview(options: {
  hasWaitingForReviewLabel: boolean;
  assignees: string[];
  mostRecentAssignmentAt?: string;
}): boolean {
  const { hasWaitingForReviewLabel, assignees, mostRecentAssignmentAt } =
    options;

  if (!hasWaitingForReviewLabel) {
    return false;
  }

  if (assignees.length === 0) {
    return false;
  }

  if (!mostRecentAssignmentAt) {
    return false;
  }

  const assignmentAt = new Date(mostRecentAssignmentAt).getTime();
  const ageMs = Date.now() - assignmentAt;

  return ageMs >= TWO_WEEKS_MS;
}
