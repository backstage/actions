import type * as github from '@actions/github';

export interface Review {
  state: string;
  submittedAt?: string;
  authorLogin?: string;
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

export interface PrData {
  authorLogin?: string;
  labels: string[];
  assignees: string[];
  mostRecentAssignmentAt?: string;
  reviews: Review[];
  latestReviews: LatestReview[];
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
    labelRemoved?: string;
    reviewState?: string;
    commentAuthor?: { login?: string; type?: string };
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
  base: number;
  exponentBase: number;
  exponentOffset: number;
  exponentDivisor: number;
  min: number;
  max: number;
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
