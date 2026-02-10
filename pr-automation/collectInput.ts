import * as core from '@actions/core';
import * as github from '@actions/github';
import { Organization, Repository } from '@octokit/graphql-schema';
import { createAppClient } from '../lib/createAppClient';
import {
  AutomationInput,
  Comment,
  Config,
  DataOptions,
  PrData,
  ProjectField,
  ProjectItemFieldValue,
} from './types';

interface EventContext {
  issueNumber: number;
  eventName: string;
  action?: string;
  owner: string;
  repo: string;
  actor: string;
  labelAdded?: string;
  reviewState?: string;
}

interface RawEventContext extends Omit<EventContext, 'issueNumber'> {
  issueNumber?: number;
}

const QUERY = `
  query(
    $owner: String!
    $repo: String!
    $issueNumber: Int!
    $projectOwner: String!
    $projectNumber: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $issueNumber) {
        number
        title
        isDraft
        reviewDecision
        author {
          login
        }
        commits(last: 1) {
          nodes {
            commit {
              committedDate
              checkSuites(first: 100) {
                nodes {
                  checkRuns(first: 100) {
                    nodes {
                      name
                      status
                      conclusion
                    }
                  }
                }
              }
            }
          }
        }
        assignees(first: 100) {
          nodes {
            login
          }
        }
        labels(first: 100) {
          nodes {
            name
          }
        }
        timelineItems(last: 10, itemTypes: [ASSIGNED_EVENT]) {
          nodes {
            __typename
            ... on AssignedEvent {
              createdAt
              assignee {
                ... on User {
                  login
                }
                ... on Bot {
                  login
                }
              }
            }
          }
        }
        reviews(first: 100) {
          nodes {
            state
            submittedAt
            body
            author {
              login
            }
          }
        }
        latestReviews(first: 100) {
          nodes {
            state
            author {
              login
            }
          }
        }
        comments(last: 100) {
          nodes {
            createdAt
            author {
              login
            }
          }
        }
        files(first: 100) {
          totalCount
          nodes {
            path
            additions
          }
        }
        projectItems(first: 100) {
          nodes {
            id
            project {
              id
            }
            fieldValues(first: 100) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field {
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
                ... on ProjectV2ItemFieldNumberValue {
                  number
                  field {
                    ... on ProjectV2Field {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    organization(login: $projectOwner) {
      projectV2(number: $projectNumber) {
        id
        fields(first: 100) {
          nodes {
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
            ... on ProjectV2Field {
              id
              name
            }
          }
        }
      }
    }
  }
`;

export async function collectInput(
  config: Config,
): Promise<AutomationInput | null> {
  const event = getEventContext();

  if (!event.issueNumber) {
    return null;
  }
  const issueNumber = event.issueNumber;
  const ensuredEvent: EventContext = {
    ...event,
    issueNumber,
  };

  const client = createAppClient();

  const data = await getPrAutomationData(client, {
    owner: ensuredEvent.owner,
    repo: ensuredEvent.repo,
    issueNumber: ensuredEvent.issueNumber,
    projectOwner: config.projectOwner,
    projectNumber: config.projectNumber,
  });

  let reviewerLogins: Set<string> | undefined;
  let reviewerTeamMissing = false;

  try {
    reviewerLogins = await listTeamMembers(
      client,
      config.reviewerTeamOrg,
      config.reviewerTeamSlug,
    );
  } catch (error) {
    if ((error as { status?: number }).status === 404) {
      reviewerTeamMissing = true;
    } else {
      throw error;
    }
  }

  return {
    event: ensuredEvent,
    config,
    client,
    data,
    reviewerLogins,
    reviewerTeamMissing,
  };
}

/**
 * Collects event context from action inputs.
 *
 * This action is expected to run via workflow_run, so all PR event
 * information must be passed via inputs. The GitHub context only
 * provides repo information.
 */
function getEventContext(): RawEventContext {
  const prNumber = core.getInput('pr-number') || undefined;
  const labelAdded = core.getInput('label-added') || undefined;
  const reviewState = core.getInput('review-state') || undefined;
  const actor = core.getInput('actor') || undefined;
  const action = core.getInput('action') || undefined;

  return {
    issueNumber: prNumber ? parseInt(prNumber, 10) : undefined,
    eventName: reviewState ? 'pull_request_review' : 'pull_request',
    action: reviewState ? 'submitted' : action,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    actor: actor ?? github.context.actor,
    labelAdded,
    reviewState,
  };
}

async function listTeamMembers(
  client: ReturnType<typeof github.getOctokit>,
  org: string,
  teamSlug: string,
): Promise<Set<string>> {
  const members = await client.paginate(client.rest.teams.listMembersInOrg, {
    org,
    team_slug: teamSlug,
    per_page: 100,
  });
  return new Set(members.map(member => member.login));
}

async function getPrAutomationData(
  client: ReturnType<typeof github.getOctokit>,
  options: DataOptions,
): Promise<PrData> {
  const data = await client.graphql<{
    repository?: Repository;
    organization?: Organization;
  }>(QUERY, { ...options });

  const pr = data.repository?.pullRequest;
  if (!pr) {
    throw new Error(`Failed to load PR #${options.issueNumber}`);
  }

  const project = data.organization?.projectV2;
  const projectId = project?.id ?? undefined;
  const projectFields = (project?.fields?.nodes ?? [])
    .map(field => mapProjectField(field))
    .filter((field): field is ProjectField => Boolean(field));

  const projectItem = pr.projectItems?.nodes?.find(
    item => item?.project?.id && item.project.id === projectId,
  );
  const projectItemFieldValues =
    projectItem?.fieldValues?.nodes
      ?.map(value => mapProjectItemField(value))
      .filter((value): value is ProjectItemFieldValue => Boolean(value)) ?? [];

  const assignees =
    pr.assignees?.nodes
      ?.map(assignee => assignee?.login)
      .filter((login): login is string => Boolean(login)) ?? [];

  const mostRecentAssignmentAt = findMostRecentAssignment(
    pr.timelineItems?.nodes,
    assignees,
  );

  const latestReviews =
    (pr as { latestReviews?: typeof pr.reviews }).latestReviews?.nodes?.map(
      review => ({
        state: review?.state ?? '',
        authorLogin: review?.author?.login ?? undefined,
      }),
    ) ?? [];

  const comments: Comment[] =
    (
      pr as {
        comments?: {
          nodes?: { createdAt?: string; author?: { login?: string } }[];
        };
      }
    ).comments?.nodes?.map(comment => ({
      authorLogin: comment?.author?.login ?? undefined,
      createdAt: comment?.createdAt ?? undefined,
    })) ?? [];

  const reviewDecision = (pr as { reviewDecision?: string }).reviewDecision as
    | 'APPROVED'
    | 'CHANGES_REQUESTED'
    | 'REVIEW_REQUIRED'
    | undefined;

  const headCommit = (
    pr as {
      commits?: {
        nodes?: {
          commit?: {
            committedDate?: string;
            checkSuites?: {
              nodes?: {
                checkRuns?: {
                  nodes?: {
                    name?: string;
                    status?: string;
                    conclusion?: string | null;
                  }[];
                };
              }[];
            };
          };
        }[];
      };
    }
  ).commits?.nodes?.[0]?.commit;

  const headCommitDate = headCommit?.committedDate;

  // Flatten check runs from all check suites
  const checkRuns =
    headCommit?.checkSuites?.nodes?.flatMap(
      suite =>
        suite?.checkRuns?.nodes?.map(run => ({
          name: run?.name ?? '',
          status: (run?.status ?? 'PENDING') as
            | 'QUEUED'
            | 'IN_PROGRESS'
            | 'COMPLETED'
            | 'WAITING'
            | 'PENDING',
          conclusion: (run?.conclusion ?? null) as
            | 'SUCCESS'
            | 'FAILURE'
            | 'NEUTRAL'
            | 'CANCELLED'
            | 'TIMED_OUT'
            | 'ACTION_REQUIRED'
            | 'SKIPPED'
            | 'STALE'
            | null,
        })) ?? [],
    ) ?? [];

  return {
    number: pr.number,
    title: pr.title,
    isDraft: (pr as { isDraft?: boolean }).isDraft ?? false,
    checkRuns,
    authorLogin: pr.author?.login ?? undefined,
    reviewDecision,
    labels:
      pr.labels?.nodes
        ?.map(label => label?.name)
        .filter((label): label is string => Boolean(label)) ?? [],
    assignees,
    mostRecentAssignmentAt,
    headCommitDate,
    reviews:
      pr.reviews?.nodes?.map(review => ({
        state: review?.state ?? '',
        submittedAt: review?.submittedAt ?? undefined,
        authorLogin: review?.author?.login ?? undefined,
        body: review?.body ?? undefined,
      })) ?? [],
    latestReviews,
    comments,
    files:
      pr.files?.nodes?.map(file => ({
        path: file?.path ?? '',
        additions: file?.additions ?? 0,
      })) ?? [],
    filesTotalCount: pr.files?.totalCount ?? 0,
    projectId,
    projectFields,
    projectItem: projectItem
      ? { id: projectItem.id, fieldValues: projectItemFieldValues }
      : undefined,
  };
}

interface AssignedEventNode {
  __typename: 'AssignedEvent';
  createdAt: string;
  assignee?: { login?: string } | null;
}

function isAssignedEvent(node: unknown): node is AssignedEventNode {
  return (
    node !== null &&
    typeof node === 'object' &&
    '__typename' in node &&
    (node as { __typename: unknown }).__typename === 'AssignedEvent'
  );
}

function findMostRecentAssignment(
  timelineNodes: unknown[] | null | undefined,
  assignees: string[],
): string | undefined {
  if (!timelineNodes || assignees.length === 0) {
    return undefined;
  }
  // Iterate backwards to find the most recent assignment
  // (nodes are in chronological order, so last items are most recent)
  for (let i = timelineNodes.length - 1; i >= 0; i--) {
    const node = timelineNodes[i];
    if (
      isAssignedEvent(node) &&
      node.assignee?.login &&
      assignees.includes(node.assignee.login)
    ) {
      return node.createdAt;
    }
  }
  return undefined;
}

function mapProjectField(field: unknown): ProjectField | undefined {
  if (!field || typeof field !== 'object') {
    return undefined;
  }
  if ('options' in (field as { options?: unknown })) {
    const typed = field as {
      id: string;
      name: string;
      options?: { id: string; name: string }[];
    };
    return {
      id: typed.id,
      name: typed.name,
      options: typed.options?.map(option => ({
        id: option.id,
        name: option.name,
      })),
    };
  }
  const typed = field as { id: string; name: string };
  return { id: typed.id, name: typed.name };
}

function mapProjectItemField(
  value:
    | {
        __typename?: string;
        name?: string | null;
        number?: number | null;
        field?: unknown;
      }
    | null
    | undefined,
): ProjectItemFieldValue | undefined {
  if (!value) {
    return undefined;
  }
  if (value.__typename === 'ProjectV2ItemFieldSingleSelectValue') {
    const field = value.field as
      | { id: string; name: string; options?: { id: string; name: string }[] }
      | null
      | undefined;
    if (!field) {
      return undefined;
    }
    return {
      fieldName: field.name,
      fieldId: field.id,
      type: 'singleSelect',
      value: value.name ?? undefined,
      options: field.options?.map(option => ({
        id: option.id,
        name: option.name,
      })),
    };
  }
  if (value.__typename === 'ProjectV2ItemFieldNumberValue') {
    const field = value.field as
      | { id: string; name: string }
      | null
      | undefined;
    if (!field) {
      return undefined;
    }
    return {
      fieldName: field.name,
      fieldId: field.id,
      type: 'number',
      value: value.number ?? undefined,
    };
  }
  return undefined;
}
