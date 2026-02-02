import { determineTargetStatusLabel } from './determineTargetStatusLabel';

describe('determineTargetStatusLabel', () => {
  const baseInput = {
    labels: new Set<string>(),
    statusLabels: new Set([
      'waiting-for:review',
      'waiting-for:author',
      'waiting-for:merge',
      'waiting-for:decision',
    ]),
    defaultStatusLabel: 'waiting-for:review',
    needsDecisionLabel: 'waiting-for:decision',
    needsChangesLabel: 'waiting-for:author',
    awaitingMergeLabel: 'waiting-for:merge',
    needsReviewLabel: 'waiting-for:review',
    reviewDecision: undefined as
      | 'APPROVED'
      | 'CHANGES_REQUESTED'
      | 'REVIEW_REQUIRED'
      | undefined,
  };

  it('respects manually added status labels', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labelAdded: 'waiting-for:merge',
      }),
    ).toBe('waiting-for:merge');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labelAdded: 'waiting-for:decision',
      }),
    ).toBe('waiting-for:decision');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labelAdded: 'waiting-for:author',
      }),
    ).toBe('waiting-for:author');
  });

  it('ignores non-status label additions', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labelAdded: 'size/small',
      }),
    ).toBe('waiting-for:review');
  });

  it('does not change status when needs-decision label is present', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labels: new Set(['waiting-for:decision']),
        reviewDecision: 'APPROVED',
      }),
    ).toBe(null);
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labels: new Set(['waiting-for:decision']),
        reviewDecision: 'CHANGES_REQUESTED',
      }),
    ).toBe(null);
  });

  it('returns needs-changes when reviewDecision is CHANGES_REQUESTED', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        reviewDecision: 'CHANGES_REQUESTED',
      }),
    ).toBe('waiting-for:author');
  });

  it('returns awaiting-merge when reviewDecision is APPROVED', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        reviewDecision: 'APPROVED',
      }),
    ).toBe('waiting-for:merge');
  });

  it('returns needs-review when reviewDecision is REVIEW_REQUIRED or undefined', () => {
    expect(determineTargetStatusLabel({ ...baseInput })).toBe(
      'waiting-for:review',
    );
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        reviewDecision: 'REVIEW_REQUIRED',
      }),
    ).toBe('waiting-for:review');
  });
});
