import * as core from '@actions/core';
import * as github from '@actions/github';
import { Organization, Repository } from '@octokit/graphql-schema';
import { createAppClient } from '../lib/createAppClient';
import {
  AutomationInput,
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
  commentAuthorLogin?: string;
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

  // [DEBUG] Log event context
  core.info(
    `[DEBUG] collectInput: Event context - eventName=${
      event.eventName
    }, action=${event.action ?? 'none'}, issueNumber=${
      event.issueNumber ?? 'none'
    }, actor=${event.actor}`,
  );

  if (!event.issueNumber) {
    core.info('[DEBUG] collectInput: No issue number in event, returning null');
    return null;
  }
  const issueNumber = event.issueNumber;
  const ensuredEvent: EventContext = {
    ...event,
    issueNumber,
  };

  const client = createAppClient();
  const botLogin = await getBotLogin(client);
  core.info(`[DEBUG] collectInput: Bot login=${botLogin ?? 'none'}`);

  if (
    botLogin &&
    (event.actor === botLogin || event.commentAuthorLogin === botLogin)
  ) {
    core.info(
      `[DEBUG] collectInput: Skipping - triggered by bot (actor=${
        event.actor
      }, commentAuthorLogin=${event.commentAuthorLogin ?? 'none'})`,
    );
    return null;
  }

  core.info(
    `[DEBUG] collectInput: Fetching PR data for ${ensuredEvent.owner}/${ensuredEvent.repo}#${ensuredEvent.issueNumber}`,
  );
  const data = await getPrAutomationData(client, {
    owner: ensuredEvent.owner,
    repo: ensuredEvent.repo,
    issueNumber: ensuredEvent.issueNumber,
    projectOwner: config.projectOwner,
    projectNumber: config.projectNumber,
  });
  core.info(
    `[DEBUG] collectInput: Successfully fetched PR data - PR #${data.number}: "${data.title}"`,
  );

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

function getEventContext(): RawEventContext {
  return {
    issueNumber: getPrNumber(),
    eventName: github.context.eventName,
    action: github.context.payload.action,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    actor: github.context.actor,
    labelAdded:
      github.context.payload.action === 'labeled'
        ? github.context.payload.label?.name
        : undefined,
    commentAuthorLogin: github.context.payload.comment?.user?.login,
  };
}

function getPrNumber() {
  if (github.context.payload.pull_request) {
    return github.context.payload.pull_request.number;
  }
  if (github.context.payload.issue?.pull_request) {
    return github.context.payload.issue.number;
  }
  return undefined;
}

async function getBotLogin(
  client: ReturnType<typeof github.getOctokit>,
): Promise<string | null> {
  try {
    const app = await client.rest.apps.getAuthenticated();
    return app.data.slug ? `${app.data.slug}[bot]` : null;
  } catch {
    return null;
  }
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

  // [DEBUG] Log project data
  core.info(
    `[DEBUG] getPrAutomationData: Project ID=${projectId ?? 'none'}, found ${
      projectFields.length
    } project field(s)`,
  );
  projectFields.forEach(field => {
    core.info(
      `[DEBUG] getPrAutomationData: Project field - name="${field.name}", id=${
        field.id
      }, type=${field.options ? 'singleSelect' : 'other'}`,
    );
  });

  const projectItem = pr.projectItems?.nodes?.find(
    item => item?.project?.id && item.project.id === projectId,
  );
  const projectItemFieldValues =
    projectItem?.fieldValues?.nodes
      ?.map(value => mapProjectItemField(value))
      .filter((value): value is ProjectItemFieldValue => Boolean(value)) ?? [];

  // [DEBUG] Log project item data
  if (projectItem) {
    core.info(
      `[DEBUG] getPrAutomationData: Found project item id=${projectItem.id}, with ${projectItemFieldValues.length} field value(s)`,
    );
    projectItemFieldValues.forEach(fieldValue => {
      const valueStr =
        typeof fieldValue.value === 'number'
          ? fieldValue.value
          : fieldValue.value ?? 'null';
      core.info(
        `[DEBUG] getPrAutomationData: Project item field - name="${fieldValue.fieldName}", value=${valueStr}`,
      );
    });
  } else {
    core.info('[DEBUG] getPrAutomationData: No project item found for this PR');
  }

  const assignees =
    pr.assignees?.nodes
      ?.map(assignee => assignee?.login)
      .filter((login): login is string => Boolean(login)) ?? [];

  // [DEBUG] Log assignment-related data
  core.info(
    `[DEBUG] Current assignees: ${
      assignees.length > 0 ? assignees.join(', ') : 'none'
    }`,
  );
  core.info(
    `[DEBUG] Fetched ${
      pr.timelineItems?.nodes?.length ?? 0
    } assignment timeline events`,
  );

  const mostRecentAssignmentAt = (() => {
    if (!pr.timelineItems?.nodes) {
      core.info('[DEBUG] No timeline items found for assignment events');
      return undefined;
    }
    // Iterate backwards to find the most recent assignment
    // (nodes are in chronological order, so last items are most recent)
    let checkedCount = 0;
    for (let i = pr.timelineItems.nodes.length - 1; i >= 0; i--) {
      const node = pr.timelineItems.nodes[i];
      checkedCount++;
      if (
        node &&
        '__typename' in node &&
        node.__typename === 'AssignedEvent' &&
        'createdAt' in node &&
        'assignee' in node &&
        node.assignee &&
        typeof node.assignee === 'object' &&
        'login' in node.assignee &&
        typeof node.assignee.login === 'string'
      ) {
        const assigneeLogin = node.assignee.login;
        const isCurrentlyAssigned = assignees.includes(assigneeLogin);
        core.info(
          `[DEBUG] Found AssignedEvent #${checkedCount} (from end): assignee=${assigneeLogin}, createdAt=${node.createdAt}, currentlyAssigned=${isCurrentlyAssigned}`,
        );
        if (isCurrentlyAssigned) {
          core.info(`[DEBUG] Using assignment timestamp: ${node.createdAt}`);
          return node.createdAt;
        }
      }
    }
    core.info(
      `[DEBUG] No matching assignment found for current assignees after checking ${checkedCount} events`,
    );
    return undefined;
  })();

  if (mostRecentAssignmentAt) {
    const assignmentDate = new Date(mostRecentAssignmentAt);
    const ageDays = Math.floor(
      (Date.now() - assignmentDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    core.info(
      `[DEBUG] Most recent assignment age: ${ageDays} days (${mostRecentAssignmentAt})`,
    );
  } else {
    core.info('[DEBUG] No mostRecentAssignmentAt timestamp found');
  }

  const latestReviewsData =
    (pr as { latestReviews?: typeof pr.reviews }).latestReviews?.nodes?.map(
      review => ({
        state: review?.state ?? '',
        authorLogin: review?.author?.login ?? undefined,
      }),
    ) ?? [];

  // [DEBUG] Log reviews data
  core.info(
    `[DEBUG] getPrAutomationData: Found ${
      pr.reviews?.nodes?.length ?? 0
    } review(s) and ${latestReviewsData.length} latest review(s)`,
  );
  latestReviewsData.forEach((review, index) => {
    core.info(
      `[DEBUG] getPrAutomationData: Latest review ${index + 1}: state=${
        review.state
      }, author=${review.authorLogin ?? 'none'}`,
    );
  });

  return {
    number: pr.number,
    title: pr.title,
    labels:
      pr.labels?.nodes
        ?.map(label => label?.name)
        .filter((label): label is string => Boolean(label)) ?? [],
    assignees,
    mostRecentAssignmentAt,
    reviews:
      pr.reviews?.nodes?.map(review => ({
        state: review?.state ?? '',
        submittedAt: review?.submittedAt ?? undefined,
        authorLogin: review?.author?.login ?? undefined,
      })) ?? [],
    latestReviews: latestReviewsData,
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
