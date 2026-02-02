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

  it('returns needs-review when author has responded to changes request', () => {
    // With changes requested but author has responded, should go back to review
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        reviewDecision: 'CHANGES_REQUESTED',
        authorHasRespondedToChangesRequest: true,
      }),
    ).toBe('waiting-for:review');

    // Without author response, should stay waiting for author
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        reviewDecision: 'CHANGES_REQUESTED',
        authorHasRespondedToChangesRequest: false,
      }),
    ).toBe('waiting-for:author');

    // Undefined should also stay waiting for author
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        reviewDecision: 'CHANGES_REQUESTED',
      }),
    ).toBe('waiting-for:author');
  });

  it('ignores author response when manually setting status', () => {
    // Manual status override takes precedence
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        reviewDecision: 'CHANGES_REQUESTED',
        authorHasRespondedToChangesRequest: true,
        labelAdded: 'waiting-for:author',
      }),
    ).toBe('waiting-for:author');
  });
});
