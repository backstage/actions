import * as core from '@actions/core';
import * as github from '@actions/github';
import { AutomationInput, OutputPlan, ProjectField, ProjectItemFieldValue } from './types';

export async function applyOutput(
  input: AutomationInput,
  output: OutputPlan,
) {
  const { event, config, client, data } = input;
  const { labelPlan, priority } = output;

  await applyLabelChanges(client, {
    owner: event.owner,
    repo: event.repo,
    issueNumber: event.issueNumber,
    labelsToAdd: [...labelPlan.labelsToAdd],
    labelsToRemove: [...labelPlan.labelsToRemove],
  });

  if (output.shouldUnassign) {
    await unassignStaleReview(client, {
      owner: event.owner,
      repo: event.repo,
      issueNumber: event.issueNumber,
      assignees: data.assignees,
    });
  }

  await syncProjectFields(client, {
    projectId: data.projectId,
    projectItemId: data.projectItem?.id,
    projectFields: data.projectFields,
    projectItemFields: data.projectItem?.fieldValues ?? [],
    statusFieldName: config.statusFieldName,
    priorityFieldName: config.priorityFieldName,
    statusLabelMap: config.statusLabelMap,
    statusLabelToSync: labelPlan.statusLabelToSync,
    priority,
  });
}

async function syncProjectFields(
  client: ReturnType<typeof github.getOctokit>,
  options: {
    projectId?: string;
    projectItemId?: string;
    projectFields: ProjectField[];
    projectItemFields: ProjectItemFieldValue[];
    statusFieldName: string;
    priorityFieldName: string;
    statusLabelMap: Record<string, string>;
    statusLabelToSync: string | null;
    priority: number;
  },
) {
  const {
    projectId,
    projectItemId,
    projectFields,
    projectItemFields,
    statusFieldName,
    priorityFieldName,
    statusLabelMap,
    statusLabelToSync,
    priority,
  } = options;

  if (!projectId) {
    throw new Error('Project ID not found for configured project');
  }
  if (!projectItemId) {
    core.info('PR is not part of the project board, skipping project sync');
    return;
  }

  const statusField = projectFields.find(field => field.name === statusFieldName);
  const priorityField = projectFields.find(field => field.name === priorityFieldName);
  if (!statusField) {
    throw new Error(`Could not find "${statusFieldName}" field`);
  }
  if (!priorityField) {
    throw new Error(`Could not find "${priorityFieldName}" field`);
  }

  const updates = buildProjectUpdates({
    projectItemFields,
    statusField,
    priorityField,
    statusLabelMap,
    statusLabelToSync,
    priority,
  });

  if (updates.length === 0) {
    core.info('Project fields already up to date');
    return;
  }

  const { mutation, variables } = buildProjectMutation(
    projectId,
    projectItemId,
    updates,
  );
  await client.graphql(mutation, variables);
}

type ProjectUpdate =
  | { fieldId: string; value: { singleSelectOptionId: string } }
  | { fieldId: string; value: { number: number } };

function buildProjectUpdates(options: {
  projectItemFields: ProjectItemFieldValue[];
  statusField: ProjectField;
  priorityField: ProjectField;
  statusLabelMap: Record<string, string>;
  statusLabelToSync: string | null;
  priority: number;
}) {
  const {
    projectItemFields,
    statusField,
    priorityField,
    statusLabelMap,
    statusLabelToSync,
    priority,
  } = options;

  const updates: ProjectUpdate[] = [];

  if (statusLabelToSync) {
    const statusName = statusLabelMap[statusLabelToSync];
    if (statusName) {
      const statusOptionId = statusField.options?.find(
        option => option.name === statusName,
      )?.id;
      if (!statusOptionId) {
        throw new Error(`"${statusName}" is not a valid option`);
      }
      const currentStatus = getCurrentFieldValue(projectItemFields, statusField.name);
      if (currentStatus !== statusName) {
        updates.push({
          fieldId: statusField.id,
          value: { singleSelectOptionId: statusOptionId },
        });
      }
    }
  }

  const currentPriorityRaw = getCurrentFieldValue(projectItemFields, priorityField.name);
  const currentPriority =
    typeof currentPriorityRaw === 'number' ? currentPriorityRaw : undefined;
  if (currentPriority !== priority) {
    updates.push({ fieldId: priorityField.id, value: { number: priority } });
  }

  return updates;
}

function buildProjectMutation(
  projectId: string,
  itemId: string,
  updates: ProjectUpdate[],
) {
  const mutationParts: string[] = [];
  const variables: Record<string, unknown> = { projectId, itemId };
  const variableDefs: string[] = ['$projectId: ID!', '$itemId: ID!'];

  updates.forEach((update, index) => {
    const alias = `update${index}`;
    if ('singleSelectOptionId' in update.value) {
      const fieldVar = `statusFieldId${index}`;
      const optionVar = `statusOptionId${index}`;
      variables[fieldVar] = update.fieldId;
      variables[optionVar] = update.value.singleSelectOptionId;
      variableDefs.push(`$${fieldVar}: ID!`, `$${optionVar}: String!`);
      mutationParts.push(`
        ${alias}: updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $${fieldVar}
            value: { singleSelectOptionId: $${optionVar} }
          }
        ) {
          projectV2Item {
            id
          }
        }
      `);
      return;
    }
    const fieldVar = `priorityFieldId${index}`;
    const numberVar = `priorityNumber${index}`;
    variables[fieldVar] = update.fieldId;
    variables[numberVar] = update.value.number;
    variableDefs.push(`$${fieldVar}: ID!`, `$${numberVar}: Float!`);
    mutationParts.push(`
      ${alias}: updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $${fieldVar}
          value: { number: $${numberVar} }
        }
      ) {
        projectV2Item {
          id
        }
      }
    `);
  });

  const mutation = `
    mutation(${variableDefs.join(', ')}) {
      ${mutationParts.join('\n')}
    }
  `;
  return { mutation, variables };
}

function getCurrentFieldValue(
  fields: ProjectItemFieldValue[],
  name: string,
): string | number | undefined {
  const field = fields.find(value => value.fieldName === name);
  return field?.value;
}

async function applyLabelChanges(
  client: ReturnType<typeof github.getOctokit>,
  options: {
    owner: string;
    repo: string;
    issueNumber: number;
    labelsToAdd: string[];
    labelsToRemove: string[];
  },
) {
  const { owner, repo, issueNumber, labelsToAdd, labelsToRemove } = options;
  for (const label of labelsToRemove) {
    try {
      await client.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: label,
      });
    } catch (error) {
      if ((error as { status?: number }).status !== 404) {
        throw error;
      }
    }
  }

  if (labelsToAdd.length > 0) {
    await client.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: labelsToAdd,
    });
  }
}

async function unassignStaleReview(
  client: ReturnType<typeof github.getOctokit>,
  options: {
    owner: string;
    repo: string;
    issueNumber: number;
    assignees: string[];
  },
) {
  const { owner, repo, issueNumber, assignees } = options;
  if (assignees.length === 0) {
    return;
  }
  core.info(
    `Unassigning stale review: removing ${assignees.length} assignee(s) from PR #${issueNumber}`,
  );
  await client.rest.issues.removeAssignees({
    owner,
    repo,
    issue_number: issueNumber,
    assignees,
  });
}
