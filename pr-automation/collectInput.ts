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
  labelRemoved?: string;
  reviewState?: string;
  commentAuthor?: { login?: string; type?: string };
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
        author {
          login
        }
        labels(first: 100) {
          nodes {
            name
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
  const botLogin = await getBotLogin(client);
  if (botLogin && (event.actor === botLogin || event.commentAuthor?.login === botLogin)) {
    return null;
  }

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
    labelRemoved:
      github.context.payload.action === 'unlabeled'
        ? github.context.payload.label?.name
        : undefined,
    reviewState: github.context.payload.review?.state,
    commentAuthor: github.context.payload.comment?.user
      ? {
          login: github.context.payload.comment.user.login,
          type: github.context.payload.comment.user.type,
        }
      : undefined,
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

  const projectItem = pr.projectItems?.nodes?.find(
    item => item?.project?.id && item.project.id === projectId,
  );
  const projectItemFieldValues =
    projectItem?.fieldValues?.nodes
      ?.map(value => mapProjectItemField(value))
      .filter((value): value is ProjectItemFieldValue => Boolean(value)) ?? [];

  return {
    authorLogin: pr.author?.login ?? undefined,
    labels:
      pr.labels?.nodes
        ?.map(label => label?.name)
        .filter((label): label is string => Boolean(label)) ?? [],
    reviews:
      pr.reviews?.nodes?.map(review => ({
        state: review?.state ?? '',
        submittedAt: review?.submittedAt ?? undefined,
        authorLogin: review?.author?.login ?? undefined,
      })) ?? [],
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
      options: typed.options?.map(option => ({ id: option.id, name: option.name })),
    };
  }
  const typed = field as { id: string; name: string };
  return { id: typed.id, name: typed.name };
}

function mapProjectItemField(value: {
  __typename?: string;
  name?: string | null;
  number?: number | null;
  field?: unknown;
} | null | undefined): ProjectItemFieldValue | undefined {
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
      options: field.options?.map(option => ({ id: option.id, name: option.name })),
    };
  }
  if (value.__typename === 'ProjectV2ItemFieldNumberValue') {
    const field = value.field as { id: string; name: string } | null | undefined;
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
