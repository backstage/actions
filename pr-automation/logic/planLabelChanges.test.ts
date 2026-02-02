import { planLabelChanges } from './planLabelChanges';

describe('planLabelChanges', () => {
  const baseOptions = {
    existingLabels: new Set<string>(),
    sizeLabel: 'size:small',
    sizeLabelSet: new Set([
      'size:tiny',
      'size:small',
      'size:medium',
      'size:large',
      'size:huge',
    ]),
    reviewerApprovedLabel: 'reviewer-approved',
    reviewerApproved: false,
    statusLabels: new Set(['waiting-for:review', 'waiting-for:merge']),
    targetStatusLabel: null,
    defaultStatusLabel: 'waiting-for:review',
  };

  it('manages size labels correctly', () => {
    const addSize = planLabelChanges({
      ...baseOptions,
      existingLabels: new Set(),
    });
    const replaceSize = planLabelChanges({
      ...baseOptions,
      existingLabels: new Set(['size:tiny']),
      sizeLabel: 'size:medium',
    });
    const keepSize = planLabelChanges({
      ...baseOptions,
      existingLabels: new Set(['size:small']),
    });
    const noConflict = planLabelChanges({
      ...baseOptions,
      existingLabels: new Set(['size:small']),
      sizeLabel: 'size:small',
    });

    expect(addSize.labelsToAdd.has('size:small')).toBe(true);
    expect(addSize.labelsToRemove.size).toBe(0);
    expect(replaceSize.labelsToAdd.has('size:medium')).toBe(true);
    expect(replaceSize.labelsToRemove.has('size:tiny')).toBe(true);
    expect(keepSize.labelsToAdd.has('size:small')).toBe(false);
    expect(keepSize.labelsToRemove.has('size:small')).toBe(false);
    expect(noConflict.labelsToAdd.has('size:small')).toBe(false);
    expect(noConflict.labelsToRemove.has('size:small')).toBe(false);
  });

  it('manages reviewer-approved label correctly', () => {
    const addApproved = planLabelChanges({
      ...baseOptions,
      reviewerApproved: true,
    });
    const removeApproved = planLabelChanges({
      ...baseOptions,
      existingLabels: new Set(['reviewer-approved']),
      reviewerApproved: false,
    });
    const keepApproved = planLabelChanges({
      ...baseOptions,
      existingLabels: new Set(['reviewer-approved']),
      reviewerApproved: true,
    });

    expect(addApproved.labelsToAdd.has('reviewer-approved')).toBe(true);
    expect(removeApproved.labelsToRemove.has('reviewer-approved')).toBe(true);
    expect(keepApproved.labelsToAdd.has('reviewer-approved')).toBe(false);
    expect(keepApproved.labelsToRemove.has('reviewer-approved')).toBe(false);
  });

  it('manages status labels correctly', () => {
    const addDefault = planLabelChanges({
      ...baseOptions,
      existingLabels: new Set(),
    });
    const syncExisting = planLabelChanges({
      ...baseOptions,
      existingLabels: new Set(['waiting-for:merge']),
      targetStatusLabel: null,
    });
    const replaceStatus = planLabelChanges({
      ...baseOptions,
      existingLabels: new Set(['waiting-for:review']),
      targetStatusLabel: 'waiting-for:merge',
    });
    const keepStatus = planLabelChanges({
      ...baseOptions,
      existingLabels: new Set(['waiting-for:merge']),
      targetStatusLabel: 'waiting-for:merge',
    });
    const multipleStatus = planLabelChanges({
      ...baseOptions,
      existingLabels: new Set(['waiting-for:review', 'waiting-for:merge']),
      targetStatusLabel: 'waiting-for:review',
    });

    expect(addDefault.labelsToAdd.has('waiting-for:review')).toBe(true);
    expect(addDefault.statusLabelToSync).toBe('waiting-for:review');
    expect(syncExisting.labelsToAdd.size).toBe(1);
    expect(syncExisting.statusLabelToSync).toBe('waiting-for:merge');
    expect(replaceStatus.labelsToAdd.has('waiting-for:merge')).toBe(true);
    expect(replaceStatus.labelsToRemove.has('waiting-for:review')).toBe(true);
    expect(replaceStatus.statusLabelToSync).toBe('waiting-for:merge');
    expect(keepStatus.labelsToAdd.has('waiting-for:merge')).toBe(false);
    expect(keepStatus.labelsToRemove.has('waiting-for:merge')).toBe(false);
    expect(keepStatus.statusLabelToSync).toBe('waiting-for:merge');
    expect(multipleStatus.labelsToRemove.has('waiting-for:merge')).toBe(true);
    expect(multipleStatus.statusLabelToSync).toBe('waiting-for:review');
  });

  it('handles complex scenario with all label types', () => {
    const plan = planLabelChanges({
      ...baseOptions,
      existingLabels: new Set([
        'size:tiny',
        'reviewer-approved',
        'waiting-for:review',
      ]),
      sizeLabel: 'size:medium',
      reviewerApproved: true,
      targetStatusLabel: 'waiting-for:merge',
    });

    expect(plan.labelsToAdd.has('size:medium')).toBe(true);
    expect(plan.labelsToRemove.has('size:tiny')).toBe(true);
    expect(plan.labelsToAdd.has('waiting-for:merge')).toBe(true);
    expect(plan.labelsToRemove.has('waiting-for:review')).toBe(true);
    expect(plan.statusLabelToSync).toBe('waiting-for:merge');
  });
});
