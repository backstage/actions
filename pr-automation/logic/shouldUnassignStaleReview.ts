const UNASSIGN_AFTER_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  const ageDays = (Date.now() - assignmentAt) / MS_PER_DAY;

  return ageDays >= UNASSIGN_AFTER_DAYS;
}
