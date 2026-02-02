import * as core from '@actions/core';
import { Config } from './types';
import { SIZE_LABELS } from './logic/calculateSizeLabel';

const STATUS_LABEL_MAP: Record<string, string> = {
  'waiting-for:review': 'Waiting for Review',
  'waiting-for:author': 'Waiting for Author',
  'waiting-for:decision': 'Waiting for Decision',
  'waiting-for:merge': 'Waiting for Merge',
};

export function getConfig(): Config {
  const projectOwner = core.getInput('project-owner', { required: true });
  const projectNumber = parseNumber(
    core.getInput('project-number', { required: false }),
    14,
  );
  const ignorePatterns = parseRegexList(
    core.getInput('ignore-patterns', { required: false }),
  );

  return {
    projectOwner,
    projectNumber,
    ignorePatterns,
    sizeLabels: SIZE_LABELS,
    statusLabelMap: STATUS_LABEL_MAP,
    defaultStatusLabel: 'waiting-for:review',
    needsDecisionLabel: 'waiting-for:decision',
    needsChangesLabel: 'waiting-for:author',
    awaitingMergeLabel: 'waiting-for:merge',
    needsReviewLabel: 'waiting-for:review',
    reviewerApprovedLabel: 'reviewer-approved',
    reviewerTeamOrg: 'backstage',
    reviewerTeamSlug: 'reviewers',
    statusFieldName: 'Status',
    priorityFieldName: 'Priority',
    priorityParams: {
      base: 100,
      exponentBase: 0.5,
      exponentOffset: 1,
      exponentDivisor: 99,
      min: 0,
      max: 100,
      reviewerBump: 100,
    },
  };
}

function parseRegexList(value: string): RegExp[] {
  return value
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(pattern => new RegExp(pattern));
}

function parseNumber(raw: string, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric input: ${raw}`);
  }
  return value;
}
