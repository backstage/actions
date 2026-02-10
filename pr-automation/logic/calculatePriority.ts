import * as core from '@actions/core';
import { CheckRun, PriorityParams, Review } from '../types';
import { getCopilotReviewPriority } from './getCopilotReviewPriority';
import { getRequiredChecksStatus } from './getRequiredChecksStatus';

export interface CalculatePriorityOptions {
  additions: number;
  priorityParams: PriorityParams;
  reviewerApproved: boolean;
  authorScore: number;
  reviews: Review[];
  isDraft: boolean;
  checkRuns: CheckRun[];
  requiredChecks: string[];
}

export function calculatePriority(options: CalculatePriorityOptions): number {
  const {
    additions,
    priorityParams,
    reviewerApproved,
    authorScore,
    reviews,
    isDraft,
    checkRuns,
    requiredChecks,
  } = options;

  const priorityParts: string[] = [];

  // Base score from PR size
  const rawPriority =
    priorityParams.base *
    Math.pow(
      priorityParams.exponentBase,
      (additions - priorityParams.exponentOffset) /
        priorityParams.exponentDivisor,
    );
  let score = Math.round(rawPriority);
  score = Math.max(0, Math.min(priorityParams.base, score));

  if (reviewerApproved) {
    score += priorityParams.reviewerBump;
    priorityParts.push(`reviewer approval +${priorityParams.reviewerBump}`);
  }

  if (authorScore > 0) {
    score += authorScore;
    priorityParts.push(`author score +${authorScore}`);
  }

  const copilotPriority = getCopilotReviewPriority(reviews);
  if (copilotPriority > 0) {
    score += copilotPriority;
    priorityParts.push(`copilot +${copilotPriority}`);
  }

  if (isDraft) {
    score *= 0.2;
    priorityParts.push('draft ×0.2');
  }

  const checksStatus = getRequiredChecksStatus(checkRuns, requiredChecks);
  if (checksStatus.multiplier < 1) {
    score *= checksStatus.multiplier;
    const statusParts: string[] = [];
    if (checksStatus.failingChecks.length > 0) {
      statusParts.push(`failing: ${checksStatus.failingChecks.join(', ')}`);
    }
    if (checksStatus.pendingChecks.length > 0) {
      statusParts.push(`pending: ${checksStatus.pendingChecks.join(', ')}`);
    }
    priorityParts.push(`checks ×0.5 (${statusParts.join('; ')})`);
  }

  const priority = Math.round(score);
  core.info(
    `Priority: ${priority}${
      priorityParts.length > 0 ? ` (${priorityParts.join(', ')})` : ''
    }`,
  );

  return priority;
}
