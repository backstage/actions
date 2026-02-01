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
    latestReviews: [],
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
        latestReviews: [{ state: 'APPROVED' }],
      }),
    ).toBe(null);
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labels: new Set(['waiting-for:decision']),
        latestReviews: [{ state: 'CHANGES_REQUESTED' }],
      }),
    ).toBe(null);
  });

  it('returns needs-changes when there are change requests', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        latestReviews: [{ state: 'CHANGES_REQUESTED' }],
      }),
    ).toBe('waiting-for:author');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        latestReviews: [{ state: 'APPROVED' }, { state: 'CHANGES_REQUESTED' }],
      }),
    ).toBe('waiting-for:author');
  });

  it('returns awaiting-merge when there are approvals and no change requests', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        latestReviews: [{ state: 'APPROVED' }],
      }),
    ).toBe('waiting-for:merge');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        latestReviews: [{ state: 'APPROVED' }, { state: 'APPROVED' }],
      }),
    ).toBe('waiting-for:merge');
  });

  it('returns needs-review when there are no reviews', () => {
    expect(determineTargetStatusLabel({ ...baseInput })).toBe(
      'waiting-for:review',
    );
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        latestReviews: [{ state: 'COMMENTED' }],
      }),
    ).toBe('waiting-for:review');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        latestReviews: [{ state: 'DISMISSED' }],
      }),
    ).toBe('waiting-for:review');
  });
});
