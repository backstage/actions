export function planLabelChanges(options: {
  existingLabels: Set<string>;
  sizeLabel: string;
  sizeLabelSet: Set<string>;
  reviewerApprovedLabel: string;
  reviewerApproved: boolean;
  statusLabels: Set<string>;
  targetStatusLabel: string | null;
  defaultStatusLabel: string;
}) {
  const {
    existingLabels,
    sizeLabel,
    sizeLabelSet,
    reviewerApprovedLabel,
    reviewerApproved,
    statusLabels,
    targetStatusLabel,
    defaultStatusLabel,
  } = options;

  const labelsToAdd = new Set<string>();
  const labelsToRemove = new Set<string>();

  for (const label of existingLabels) {
    if (sizeLabelSet.has(label) && label !== sizeLabel) {
      labelsToRemove.add(label);
    }
  }
  if (!existingLabels.has(sizeLabel)) {
    labelsToAdd.add(sizeLabel);
  }

  if (reviewerApproved && !existingLabels.has(reviewerApprovedLabel)) {
    labelsToAdd.add(reviewerApprovedLabel);
  }
  if (!reviewerApproved && existingLabels.has(reviewerApprovedLabel)) {
    labelsToRemove.add(reviewerApprovedLabel);
  }

  const existingStatusLabels = new Set(
    [...existingLabels].filter(label => statusLabels.has(label)),
  );
  let statusLabelToSync: string | null = null;

  if (targetStatusLabel === null) {
    if (existingStatusLabels.size === 0) {
      labelsToAdd.add(defaultStatusLabel);
      statusLabelToSync = defaultStatusLabel;
    } else {
      statusLabelToSync = existingStatusLabels.values().next().value ?? null;
    }
  } else {
    for (const label of existingStatusLabels) {
      if (label !== targetStatusLabel) {
        labelsToRemove.add(label);
      }
    }
    if (!existingLabels.has(targetStatusLabel)) {
      labelsToAdd.add(targetStatusLabel);
    }
    statusLabelToSync = targetStatusLabel;
  }

  for (const label of labelsToAdd) {
    if (labelsToRemove.has(label)) {
      labelsToRemove.delete(label);
    }
  }

  return { labelsToAdd, labelsToRemove, statusLabelToSync };
}
