import { Review } from '../types';

const COPILOT_LOGIN = 'copilot-pull-request-reviewer';
const COPILOT_LOGIN_BOT = `${COPILOT_LOGIN}[bot]`;
const PRIORITY_PATTERN = /<!--\s*priority:\s*(\d+)\s*-->/i;

function extractPriority(body: string): number | undefined {
  const match = body.match(PRIORITY_PATTERN);
  if (!match) {
    return undefined;
  }
  const priority = parseInt(match[1], 10);
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
    return undefined;
  }
  return priority;
}

/**
 * Extracts the priority value from the most recent Copilot review comment
 * that contains a valid priority pattern.
 * Looks for HTML comments in the format `<!-- priority: N -->` where N is 0-100.
 * Returns 0 if no valid priority comment is found.
 */
export function getCopilotReviewPriority(reviews: Review[]): number {
  const copilotReviewsWithPriority = reviews
    .filter(
      r =>
        (r.authorLogin === COPILOT_LOGIN ||
          r.authorLogin === COPILOT_LOGIN_BOT) &&
        r.body &&
        r.submittedAt,
    )
    .map(r => ({ review: r, priority: extractPriority(r.body!) }))
    .filter(
      (r): r is { review: Review; priority: number } =>
        r.priority !== undefined,
    )
    .sort((a, b) => (b.review.submittedAt! > a.review.submittedAt! ? 1 : -1));

  if (copilotReviewsWithPriority.length === 0) {
    return 0;
  }

  return copilotReviewsWithPriority[0].priority;
}
