import type * as github from '@actions/github';

export interface Review {
  state: string;
  submittedAt?: string;
  authorLogin?: string;
  body?: string;
}

export interface LatestReview {
  state: string;
  authorLogin?: string;
}

export interface FileChange {
  path: string;
  additions: number;
}

export interface ProjectField {
  id: string;
  name: string;
  options?: { id: string; name: string }[];
}

export interface ProjectItemFieldValue {
  fieldName: string;
  fieldId: string;
  type: 'singleSelect' | 'number';
  value: string | number | undefined;
  options?: { id: string; name: string }[];
}

export interface ProjectItem {
  id: string;
  fieldValues: ProjectItemFieldValue[];
}

export interface Comment {
  authorLogin?: string;
  createdAt?: string;
}

export interface PrData {
  number: number;
  title: string;
  isDraft: boolean;
  authorLogin?: string;
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED';
  labels: string[];
  assignees: string[];
  mostRecentAssignmentAt?: string;
  headCommitDate?: string;
  reviews: Review[];
  latestReviews: LatestReview[];
  comments: Comment[];
  files: FileChange[];
  filesTotalCount: number;
  projectId?: string;
  projectFields: ProjectField[];
  projectItem?: ProjectItem;
}

export interface AutomationInput {
  event: {
    issueNumber: number;
    eventName: string;
    action?: string;
    owner: string;
    repo: string;
    actor: string;
    labelAdded?: string;
    reviewState?: string;
  };
  config: Config;
  client: ReturnType<typeof github.getOctokit>;
  data: PrData;
  reviewerLogins?: Set<string>;
  reviewerTeamMissing: boolean;
}

export interface OutputPlan {
  labelPlan: {
    labelsToAdd: Set<string>;
    labelsToRemove: Set<string>;
    statusLabelToSync: string | null;
  };
  priority: number;
  shouldUnassign?: boolean;
}

export interface DataOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  projectOwner: string;
  projectNumber: number;
}

export interface SizeLabelConfig {
  label: string;
  threshold: number;
}

export interface PriorityParams {
  /** Starting/max priority value before size-based reduction (min is always 0) */
  base: number;
  /** Base of the exponential decay (e.g., 0.5 = halve priority per divisor) */
  exponentBase: number;
  /** Lines of additions before priority starts decreasing */
  exponentOffset: number;
  /** Lines of additions per halving of priority (default 500: 0→100, 500→50, 5000→0) */
  exponentDivisor: number;
  /** Priority boost when PR has reviewer-approved label */
  reviewerBump: number;
}

export interface Config {
  projectOwner: string;
  projectNumber: number;
  ignorePatterns: RegExp[];
  sizeLabels: SizeLabelConfig[];
  statusLabelMap: Record<string, string>;
  defaultStatusLabel: string;
  needsDecisionLabel: string;
  needsChangesLabel: string;
  awaitingMergeLabel: string;
  needsReviewLabel: string;
  reviewerApprovedLabel: string;
  reviewerTeamOrg: string;
  reviewerTeamSlug: string;
  statusFieldName: string;
  priorityFieldName: string;
  priorityParams: PriorityParams;
}
