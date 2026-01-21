import { determineTargetStatusLabel } from './determineTargetStatusLabel';

describe('determineTargetStatusLabel', () => {
  const baseInput = {
    eventName: 'pull_request',
    action: 'opened',
    labels: new Set<string>(),
    statusLabels: new Set([
      'status:needs-review',
      'status:needs-changes',
      'status:awaiting-merge',
      'status:needs-decision',
    ]),
    defaultStatusLabel: 'status:needs-review',
    needsDecisionLabel: 'status:needs-decision',
    needsChangesLabel: 'status:needs-changes',
    awaitingMergeLabel: 'status:awaiting-merge',
    needsReviewLabel: 'status:needs-review',
    reviews: [],
  };

  it('handles manual label changes', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'labeled',
        labelAdded: 'status:awaiting-merge',
      }),
    ).toBe('status:awaiting-merge');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'unlabeled',
        labelRemoved: 'status:awaiting-merge',
      }),
    ).toBe('status:needs-review');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labels: new Set(['status:needs-decision']),
        eventName: 'pull_request',
        action: 'labeled',
        labelAdded: 'status:needs-decision',
      }),
    ).toBe('status:needs-decision');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labels: new Set(['status:needs-decision']),
        eventName: 'pull_request',
        action: 'synchronize',
      }),
    ).toBe(null);
  });

  it('handles author actions after needs-changes', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labels: new Set(['status:needs-changes']),
        eventName: 'pull_request',
        action: 'synchronize',
        actor: 'author',
        authorLogin: 'author',
      }),
    ).toBe('status:needs-review');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labels: new Set(['status:needs-changes']),
        eventName: 'issue_comment',
        commentAuthor: { login: 'author', type: 'User' },
        authorLogin: 'author',
      }),
    ).toBe('status:needs-review');
  });

  it('handles review events', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request_review',
        action: 'submitted',
        reviewState: 'APPROVED',
      }),
    ).toBe('status:awaiting-merge');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request_review',
        action: 'submitted',
        reviewState: 'CHANGES_REQUESTED',
      }),
    ).toBe('status:needs-changes');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request_review',
        action: 'submitted',
        reviewState: 'APPROVED',
        reviews: [{ state: 'CHANGES_REQUESTED' }],
      }),
    ).toBe('status:needs-changes');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request_review',
        action: 'dismissed',
        reviews: [{ state: 'CHANGES_REQUESTED' }],
      }),
    ).toBe('status:needs-changes');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request_review',
        action: 'dismissed',
        reviews: [{ state: 'APPROVED' }],
      }),
    ).toBe('status:awaiting-merge');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request_review',
        action: 'dismissed',
        reviews: [],
      }),
    ).toBe('status:needs-review');
  });

  it('handles pull request events', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'opened',
      }),
    ).toBe('status:needs-review');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'opened',
        reviews: [{ state: 'APPROVED' }],
      }),
    ).toBe('status:awaiting-merge');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'opened',
        reviews: [{ state: 'CHANGES_REQUESTED' }],
      }),
    ).toBe('status:needs-changes');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'synchronize',
      }),
    ).toBe('status:needs-review');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'reopened',
      }),
    ).toBe('status:needs-review');
  });

  it('handles issue comment events', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'issue_comment',
        commentAuthor: { login: 'bot', type: 'Bot' },
      }),
    ).toBe(null);
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'issue_comment',
        commentAuthor: { login: 'user', type: 'User' },
        reviews: [{ state: 'CHANGES_REQUESTED' }],
      }),
    ).toBe('status:needs-changes');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'unknown_event',
      }),
    ).toBe(null);
  });
});
