import { Review } from '../types';

const COPILOT_LOGIN = 'copilot-pull-request-reviewer[bot]';
const PRIORITY_PATTERN = /<!--\s*priority:\s*(\d+)\s*-->/i;

/**
 * Extracts the priority value from the most recent Copilot review comment.
 * Looks for HTML comments in the format `<!-- priority: N -->` where N is 0-100.
 * Returns 0 if no valid priority comment is found.
 */
export function getCopilotReviewPriority(reviews: Review[]): number {
  const copilotReviews = reviews
    .filter(r => r.authorLogin === COPILOT_LOGIN && r.body && r.submittedAt)
    .sort((a, b) => (b.submittedAt! > a.submittedAt! ? 1 : -1));

  if (copilotReviews.length === 0) {
    return 0;
  }

  const mostRecentReview = copilotReviews[0];
  const match = mostRecentReview.body!.match(PRIORITY_PATTERN);

  if (!match) {
    return 0;
  }

  const priority = parseInt(match[1], 10);

  if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
    return 0;
  }

  return priority;
}
