import * as core from '@actions/core';
import { Config } from './types';
import { SIZE_LABELS } from './logic/calculateSizeLabel';

const STATUS_LABEL_MAP: Record<string, string> = {
  'waiting-for:review': 'Waiting for Review',
  'waiting-for:author': 'Waiting for Author',
  'waiting-for:decision': 'Waiting for Decision',
  'waiting-for:merge': 'Waiting for Merge',
};

const DEFAULT_STATUS_LABEL = 'waiting-for:review';
const NEEDS_DECISION_LABEL = 'waiting-for:decision';
const NEEDS_CHANGES_LABEL = 'waiting-for:author';
const AWAITING_MERGE_LABEL = 'waiting-for:merge';
const NEEDS_REVIEW_LABEL = 'waiting-for:review';

const REVIEWER_APPROVED_LABEL = 'reviewer-approved';
const REVIEWER_TEAM_ORG = 'backstage';
const REVIEWER_TEAM_SLUG = 'reviewers';

const STATUS_FIELD_NAME = 'Status';
const PRIORITY_FIELD_NAME = 'Priority';

export function getConfig(): Config {
  const projectOwner = core.getInput('project-owner', { required: true });
  const projectNumber = parseNumberInput('project-number', 14);
  const ignorePatterns = parseRegexList(
    core.getInput('ignore-patterns', { required: false }),
  );

  return {
    projectOwner,
    projectNumber,
    ignorePatterns,
    sizeLabels: SIZE_LABELS,
    statusLabelMap: STATUS_LABEL_MAP,
    defaultStatusLabel: DEFAULT_STATUS_LABEL,
    needsDecisionLabel: NEEDS_DECISION_LABEL,
    needsChangesLabel: NEEDS_CHANGES_LABEL,
    awaitingMergeLabel: AWAITING_MERGE_LABEL,
    needsReviewLabel: NEEDS_REVIEW_LABEL,
    reviewerApprovedLabel: REVIEWER_APPROVED_LABEL,
    reviewerTeamOrg: REVIEWER_TEAM_ORG,
    reviewerTeamSlug: REVIEWER_TEAM_SLUG,
    statusFieldName: STATUS_FIELD_NAME,
    priorityFieldName: PRIORITY_FIELD_NAME,
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

function parseNumberInput(name: string, fallback: number) {
  const raw = core.getInput(name, { required: false });
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Invalid numeric input for ${name}: ${raw}`);
  }
  return value;
}
