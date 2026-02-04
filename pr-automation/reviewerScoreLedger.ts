import * as core from '@actions/core';
import * as github from '@actions/github';
import { AutomationInput } from './types';

const LEDGER_PROJECT_NUMBER = 16;
const SCORE_FIELD_NAME = 'Score';
const PR_FIELD_NAME = 'Pull Request';
const CREATED_AT_FIELD_NAME = 'Created At';
const STATUS_FIELD_NAME = 'Status';

const REVIEW_SCORES: Record<string, number> = {
  APPROVED: 2,
  CHANGES_REQUESTED: 3,
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  APPROVED: 'Approve',
  CHANGES_REQUESTED: 'Request changes',
};

interface ProjectData {
  id: string;
  scoreFieldId: string;
  prFieldId: string;
  createdAtFieldId: string;
  statusFieldId: string;
  statusOptions: Map<string, string>; // label -> optionId
}

interface LedgerEntry {
  itemId: string;
  assigneeLogin: string;
  prRef?: string;
  score?: number;
}

/**
 * Updates the reviewer score ledger when a team member submits a review.
 * Creates a draft item in the ledger project if one doesn't already exist
 * for this PR + reviewer combination.
 */
export async function updateReviewerScoreLedger(
  input: AutomationInput,
  reviewerLogins: Set<string> | undefined,
): Promise<void> {
  const { event, client, data } = input;

  // Only process review submissions
  if (
    event.eventName !== 'pull_request_review' ||
    event.action !== 'submitted'
  ) {
    return;
  }

  // Skip if no reviewer team available
  if (!reviewerLogins || reviewerLogins.size === 0) {
    return;
  }

  // The actor is the person who submitted the review
  const reviewer = event.actor;
  if (!reviewerLogins.has(reviewer)) {
    return;
  }

  // Get review state from the event context
  const reviewState = event.reviewState?.toUpperCase();
  if (!reviewState || !(reviewState in REVIEW_SCORES)) {
    return;
  }

  const score = REVIEW_SCORES[reviewState];
  const prRef = `${event.repo}#${event.issueNumber}`;

  core.startGroup('Reviewer Score Ledger');
  core.info(`Reviewer: ${reviewer}, Review: ${reviewState}, Score: +${score}`);

  try {
    // Get project data (ID and field IDs)
    const project = await getProjectData(client, event.owner);
    if (!project) {
      core.warning('Reviewer score ledger project not found, skipping');
      core.endGroup();
      return;
    }

    // Look up status option ID for this review type
    const statusLabel = REVIEW_STATUS_LABELS[reviewState];
    const statusOptionId = project.statusOptions.get(statusLabel);
    if (!statusOptionId) {
      core.warning(
        `Status option "${statusLabel}" not found in ledger project`,
      );
      core.endGroup();
      return;
    }

    // Create ledger entry (multiple reviews on same PR add more score)
    await createLedgerEntry(client, {
      projectId: project.id,
      scoreFieldId: project.scoreFieldId,
      prFieldId: project.prFieldId,
      createdAtFieldId: project.createdAtFieldId,
      statusFieldId: project.statusFieldId,
      statusOptionId,
      title: data.title,
      reviewer,
      score,
      prRef,
    });

    core.info(`Created ledger entry: ${reviewer} +${score} for ${prRef}`);
  } catch (error) {
    core.warning(`Failed to update reviewer score ledger: ${error}`);
  }

  core.endGroup();
}

async function getProjectData(
  client: ReturnType<typeof github.getOctokit>,
  orgLogin: string,
): Promise<ProjectData | null> {
  const query = `
    query($org: String!, $number: Int!) {
      organization(login: $org) {
        projectV2(number: $number) {
          id
          fields(first: 20) {
            nodes {
              ... on ProjectV2Field {
                id
                name
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  interface FieldNode {
    id: string;
    name: string;
    options?: Array<{ id: string; name: string }>;
  }

  const result = await client.graphql<{
    organization?: {
      projectV2?: {
        id: string;
        fields: {
          nodes: Array<FieldNode | null>;
        };
      };
    };
  }>(query, { org: orgLogin, number: LEDGER_PROJECT_NUMBER });

  const project = result.organization?.projectV2;
  if (!project) {
    return null;
  }

  const scoreField = project.fields.nodes.find(
    f => f?.name === SCORE_FIELD_NAME,
  );
  const prField = project.fields.nodes.find(f => f?.name === PR_FIELD_NAME);
  const createdAtField = project.fields.nodes.find(
    f => f?.name === CREATED_AT_FIELD_NAME,
  );
  const statusField = project.fields.nodes.find(
    f => f?.name === STATUS_FIELD_NAME,
  );

  if (!scoreField || !prField || !createdAtField || !statusField) {
    core.warning(
      `Missing required fields in ledger project: Score=${!!scoreField}, Pull Request=${!!prField}, Created At=${!!createdAtField}, Status=${!!statusField}`,
    );
    return null;
  }

  const statusOptions = new Map<string, string>();
  for (const opt of statusField.options ?? []) {
    statusOptions.set(opt.name, opt.id);
  }

  return {
    id: project.id,
    scoreFieldId: scoreField.id,
    prFieldId: prField.id,
    createdAtFieldId: createdAtField.id,
    statusFieldId: statusField.id,
    statusOptions,
  };
}

async function getLedgerEntries(
  client: ReturnType<typeof github.getOctokit>,
  projectId: string,
  filterQuery?: string,
): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = [];
  let cursor: string | null = null;

  // Paginate through all items (expect < 1000 for this use case)
  for (let page = 0; page < 10; page++) {
    const query = `
      query($projectId: ID!, $cursor: String, $filterQuery: String) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100, after: $cursor, query: $filterQuery) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                fieldValues(first: 10) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      text
                      field {
                        ... on ProjectV2Field {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      number
                      field {
                        ... on ProjectV2Field {
                          name
                        }
                      }
                    }
                  }
                }
                content {
                  ... on DraftIssue {
                    assignees(first: 1) {
                      nodes {
                        login
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    interface FieldValue {
      text?: string;
      number?: number;
      field?: { name: string };
    }

    interface ProjectItemNode {
      id: string;
      fieldValues: {
        nodes: Array<FieldValue | null>;
      };
      content?: {
        assignees?: { nodes: Array<{ login: string } | null> };
      };
    }

    interface ProjectItemsResult {
      node?: {
        items: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<ProjectItemNode | null>;
        };
      };
    }

    const result: ProjectItemsResult = await client.graphql(query, {
      projectId,
      cursor,
      filterQuery,
    });

    const items = result.node?.items;
    if (!items) {
      break;
    }

    for (const item of items.nodes) {
      if (!item) continue;

      const prFieldValue = item.fieldValues.nodes.find(
        (fv): fv is FieldValue => fv?.field?.name === PR_FIELD_NAME,
      );
      const scoreFieldValue = item.fieldValues.nodes.find(
        (fv): fv is FieldValue => fv?.field?.name === SCORE_FIELD_NAME,
      );
      const assigneeLogin = item.content?.assignees?.nodes?.[0]?.login;

      entries.push({
        itemId: item.id,
        assigneeLogin: assigneeLogin ?? '',
        prRef: prFieldValue?.text,
        score: scoreFieldValue?.number,
      });
    }

    if (!items.pageInfo.hasNextPage) {
      break;
    }
    cursor = items.pageInfo.endCursor;
  }

  return entries;
}

/**
 * Gets the total score for a user from the reviewer ledger.
 * Returns 0 if the user has no entries or if the ledger is not accessible.
 */
export async function getReviewerScore(
  client: ReturnType<typeof github.getOctokit>,
  orgLogin: string,
  userLogin: string,
): Promise<number> {
  try {
    const project = await getProjectData(client, orgLogin);
    if (!project) {
      return 0;
    }

    const entries = await getLedgerEntries(
      client,
      project.id,
      `assignee:${userLogin}`,
    );
    const totalScore = entries.reduce((sum, e) => sum + (e.score ?? 0), 0);

    return totalScore;
  } catch (error) {
    core.warning(`Failed to get reviewer score for ${userLogin}: ${error}`);
    return 0;
  }
}

async function createLedgerEntry(
  client: ReturnType<typeof github.getOctokit>,
  options: {
    projectId: string;
    scoreFieldId: string;
    prFieldId: string;
    createdAtFieldId: string;
    statusFieldId: string;
    statusOptionId: string;
    title: string;
    reviewer: string;
    score: number;
    prRef: string;
  },
): Promise<void> {
  const {
    projectId,
    scoreFieldId,
    prFieldId,
    createdAtFieldId,
    statusFieldId,
    statusOptionId,
    title,
    reviewer,
    score,
    prRef,
  } = options;

  // First, get the user's node ID
  const userQuery = `
    query($login: String!) {
      user(login: $login) {
        id
      }
    }
  `;
  const userResult = await client.graphql<{
    user?: { id: string };
  }>(userQuery, { login: reviewer });

  const userId = userResult.user?.id;
  if (!userId) {
    throw new Error(`Could not find user ID for ${reviewer}`);
  }

  // Create draft issue
  const createMutation = `
    mutation($projectId: ID!, $title: String!, $assigneeIds: [ID!]) {
      addProjectV2DraftIssue(input: {
        projectId: $projectId
        title: $title
        assigneeIds: $assigneeIds
      }) {
        projectItem {
          id
        }
      }
    }
  `;

  const createResult = await client.graphql<{
    addProjectV2DraftIssue: { projectItem: { id: string } };
  }>(createMutation, {
    projectId,
    title: `Review: ${title}`,
    assigneeIds: [userId],
  });

  const itemId = createResult.addProjectV2DraftIssue.projectItem.id;

  // Update all fields in a single batched mutation
  const updateFieldsMutation = `
    mutation(
      $projectId: ID!
      $itemId: ID!
      $scoreFieldId: ID!
      $score: Float!
      $prFieldId: ID!
      $prRef: String!
      $createdAtFieldId: ID!
      $createdAt: Date!
      $statusFieldId: ID!
      $statusOptionId: String!
    ) {
      setScore: updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $scoreFieldId
        value: { number: $score }
      }) {
        projectV2Item { id }
      }
      setPr: updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $prFieldId
        value: { text: $prRef }
      }) {
        projectV2Item { id }
      }
      setCreatedAt: updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $createdAtFieldId
        value: { date: $createdAt }
      }) {
        projectV2Item { id }
      }
      setStatus: updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $statusFieldId
        value: { singleSelectOptionId: $statusOptionId }
      }) {
        projectV2Item { id }
      }
    }
  `;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  await client.graphql(updateFieldsMutation, {
    projectId,
    itemId,
    scoreFieldId,
    score,
    prFieldId,
    prRef,
    createdAtFieldId,
    createdAt: today,
    statusFieldId,
    statusOptionId,
  });
}
