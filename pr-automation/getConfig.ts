import * as core from '@actions/core';
import { Config } from './types';
import { SIZE_LABELS } from './logic/calculateSizeLabel';

const STATUS_LABEL_MAP: Record<string, string> = {
  'status:needs-changes': 'Needs Changes',
  'status:needs-review': 'Needs Review',
  'status:needs-owner-review': 'Needs Owner Review',
  'status:needs-decision': 'Needs Decision',
  'status:awaiting-merge': 'Awaiting Merge',
};

const DEFAULT_STATUS_LABEL = 'status:needs-review';
const NEEDS_DECISION_LABEL = 'status:needs-decision';
const NEEDS_CHANGES_LABEL = 'status:needs-changes';
const AWAITING_MERGE_LABEL = 'status:awaiting-merge';
const NEEDS_REVIEW_LABEL = 'status:needs-review';

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
