import { PriorityParams } from '../types';

export function calculatePriority(
  additions: number,
  params: PriorityParams,
  hasReviewerApproved: boolean,
): number {
  const rawPriority =
    params.base *
    Math.pow(
      params.exponentBase,
      (additions - params.exponentOffset) / params.exponentDivisor,
    );
  let priority = Math.round(rawPriority);
  priority = Math.max(0, Math.min(params.base, priority));

  if (hasReviewerApproved) {
    priority += params.reviewerBump;
  }

  return priority;
}
