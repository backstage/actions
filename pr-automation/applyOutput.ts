import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  AutomationInput,
  OutputPlan,
  ProjectField,
  ProjectItemFieldValue,
} from './types';

export async function applyOutput(input: AutomationInput, output: OutputPlan) {
  const { event, config, client, data } = input;
  const { labelPlan, priority } = output;

  // [DEBUG] Log what actions will be taken
  core.info(
    `[DEBUG] applyOutput: Starting output application for PR #${event.issueNumber}`,
  );
  core.info(
    `[DEBUG] applyOutput: Labels to add: ${
      labelPlan.labelsToAdd.size > 0
        ? Array.from(labelPlan.labelsToAdd).join(', ')
        : 'none'
    }`,
  );
  core.info(
    `[DEBUG] applyOutput: Labels to remove: ${
      labelPlan.labelsToRemove.size > 0
        ? Array.from(labelPlan.labelsToRemove).join(', ')
        : 'none'
    }`,
  );
  core.info(`[DEBUG] applyOutput: Priority: ${priority}`);
  core.info(
    `[DEBUG] applyOutput: Should unassign stale reviewers: ${
      output.shouldUnassign ?? false
    }`,
  );

  await applyLabelChanges(client, {
    owner: event.owner,
    repo: event.repo,
    issueNumber: event.issueNumber,
    labelsToAdd: [...labelPlan.labelsToAdd],
    labelsToRemove: [...labelPlan.labelsToRemove],
  });

  if (output.shouldUnassign) {
    core.info(`[DEBUG] applyOutput: Executing stale review unassignment`);
    await unassignStaleReview(client, {
      owner: event.owner,
      repo: event.repo,
      issueNumber: event.issueNumber,
      assignees: data.assignees,
    });
  } else {
    core.info(
      '[DEBUG] applyOutput: Skipping stale review unassignment (shouldUnassign=false)',
    );
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

  // [DEBUG] Log project field sync details
  core.info(`[DEBUG] syncProjectFields: Starting project field sync`);
  core.info(
    `[DEBUG] syncProjectFields: projectId=${
      projectId ?? 'none'
    }, projectItemId=${projectItemId ?? 'none'}`,
  );
  core.info(
    `[DEBUG] syncProjectFields: statusLabelToSync=${
      statusLabelToSync ?? 'none'
    }, priority=${priority}`,
  );

  if (!projectId) {
    throw new Error('Project ID not found for configured project');
  }
  if (!projectItemId) {
    core.info('PR is not part of the project board, skipping project sync');
    return;
  }

  const statusField = projectFields.find(
    field => field.name === statusFieldName,
  );
  const priorityField = projectFields.find(
    field => field.name === priorityFieldName,
  );
  if (!statusField) {
    throw new Error(`Could not find "${statusFieldName}" field`);
  }
  if (!priorityField) {
    throw new Error(`Could not find "${priorityFieldName}" field`);
  }

  core.info(
    `[DEBUG] syncProjectFields: Found statusField id=${statusField.id}, priorityField id=${priorityField.id}`,
  );

  const updates = buildProjectUpdates({
    projectItemFields,
    statusField,
    priorityField,
    statusLabelMap,
    statusLabelToSync,
    priority,
  });

  // [DEBUG] Log project updates
  core.info(
    `[DEBUG] syncProjectFields: Computed ${updates.length} field update(s)`,
  );
  updates.forEach((update, index) => {
    if ('singleSelectOptionId' in update.value) {
      core.info(
        `[DEBUG] syncProjectFields: Update ${index + 1}: status field=${
          update.fieldId
        }, optionId=${update.value.singleSelectOptionId}`,
      );
    } else {
      core.info(
        `[DEBUG] syncProjectFields: Update ${index + 1}: priority field=${
          update.fieldId
        }, value=${update.value.number}`,
      );
    }
  });

  if (updates.length === 0) {
    core.info('Project fields already up to date');
    return;
  }

  core.info(
    `[DEBUG] syncProjectFields: Executing GraphQL mutation with ${updates.length} update(s)`,
  );
  const { mutation, variables } = buildProjectMutation(
    projectId,
    projectItemId,
    updates,
  );
  await client.graphql(mutation, variables);
  core.info('[DEBUG] syncProjectFields: Successfully updated project fields');
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

  // [DEBUG] Log status field sync logic
  core.info(
    `[DEBUG] buildProjectUpdates: statusLabelToSync=${
      statusLabelToSync ?? 'none'
    }`,
  );
  if (statusLabelToSync) {
    const statusName = statusLabelMap[statusLabelToSync];
    core.info(
      `[DEBUG] buildProjectUpdates: statusLabelToSync="${statusLabelToSync}" maps to statusName="${
        statusName ?? 'none'
      }"`,
    );
    if (statusName) {
      const statusOptionId = statusField.options?.find(
        option => option.name === statusName,
      )?.id;
      core.info(
        `[DEBUG] buildProjectUpdates: Found statusOptionId=${
          statusOptionId ?? 'none'
        } for statusName="${statusName}"`,
      );
      if (!statusOptionId) {
        throw new Error(`"${statusName}" is not a valid option`);
      }
      const currentStatus = getCurrentFieldValue(
        projectItemFields,
        statusField.name,
      );
      core.info(
        `[DEBUG] buildProjectUpdates: Current status="${
          currentStatus ?? 'none'
        }", target status="${statusName}", match=${
          currentStatus === statusName
        }`,
      );
      if (currentStatus !== statusName) {
        updates.push({
          fieldId: statusField.id,
          value: { singleSelectOptionId: statusOptionId },
        });
        core.info(`[DEBUG] buildProjectUpdates: Added status field update`);
      } else {
        core.info(
          `[DEBUG] buildProjectUpdates: Skipping status field update - already matches`,
        );
      }
    } else {
      core.info(
        `[DEBUG] buildProjectUpdates: No statusName found for statusLabelToSync="${statusLabelToSync}"`,
      );
    }
  }

  const currentPriorityRaw = getCurrentFieldValue(
    projectItemFields,
    priorityField.name,
  );
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

  // [DEBUG] Log label changes
  core.info(
    `[DEBUG] applyLabelChanges: Removing ${labelsToRemove.length} label(s)`,
  );
  for (const label of labelsToRemove) {
    try {
      core.info(`[DEBUG] applyLabelChanges: Removing label "${label}"`);
      await client.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: label,
      });
      core.info(
        `[DEBUG] applyLabelChanges: Successfully removed label "${label}"`,
      );
    } catch (error) {
      if ((error as { status?: number }).status !== 404) {
        throw error;
      }
      core.info(
        `[DEBUG] applyLabelChanges: Label "${label}" not found (404), skipping`,
      );
    }
  }

  if (labelsToAdd.length > 0) {
    core.info(
      `[DEBUG] applyLabelChanges: Adding ${
        labelsToAdd.length
      } label(s): ${labelsToAdd.join(', ')}`,
    );
    await client.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: labelsToAdd,
    });
    core.info(`[DEBUG] applyLabelChanges: Successfully added labels`);
  } else {
    core.info('[DEBUG] applyLabelChanges: No labels to add');
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
    core.info('[DEBUG] unassignStaleReview: No assignees to remove, skipping');
    return;
  }
  core.info(
    `Unassigning stale review: removing ${assignees.length} assignee(s) from PR #${issueNumber}`,
  );
  core.info(
    `[DEBUG] unassignStaleReview: Removing assignees: ${assignees.join(', ')}`,
  );
  await client.rest.issues.removeAssignees({
    owner,
    repo,
    issue_number: issueNumber,
    assignees,
  });
  core.info(
    `[DEBUG] unassignStaleReview: Successfully unassigned ${assignees.length} assignee(s)`,
  );
}
