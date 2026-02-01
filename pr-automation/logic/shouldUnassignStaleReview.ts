import * as core from '@actions/core';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export function shouldUnassignStaleReview(options: {
  hasWaitingForReviewLabel: boolean;
  assignees: string[];
  mostRecentAssignmentAt?: string;
}): boolean {
  const { hasWaitingForReviewLabel, assignees, mostRecentAssignmentAt } =
    options;

  // [DEBUG] Log each condition check
  if (!hasWaitingForReviewLabel) {
    core.info(
      '[DEBUG] shouldUnassignStaleReview: false - no waiting-for:review label',
    );
    return false;
  }

  if (assignees.length === 0) {
    core.info('[DEBUG] shouldUnassignStaleReview: false - no assignees');
    return false;
  }

  if (!mostRecentAssignmentAt) {
    core.info(
      '[DEBUG] shouldUnassignStaleReview: false - no assignment timestamp',
    );
    return false;
  }

  const assignmentAt = new Date(mostRecentAssignmentAt).getTime();
  const now = Date.now();
  const ageMs = now - assignmentAt;
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

  core.info(
    `[DEBUG] shouldUnassignStaleReview: assignment age=${ageDays} days (${ageMs}ms), threshold=${TWO_WEEKS_MS}ms`,
  );

  const result = ageMs >= TWO_WEEKS_MS;
  core.info(
    `[DEBUG] shouldUnassignStaleReview: ${result ? 'true' : 'false'} - ${
      result ? 'assignment is stale' : 'assignment is not stale yet'
    }`,
  );

  return result;
}
