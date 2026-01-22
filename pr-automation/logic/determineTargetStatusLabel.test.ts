import { determineTargetStatusLabel } from './determineTargetStatusLabel';

describe('determineTargetStatusLabel', () => {
  const baseInput = {
    eventName: 'pull_request',
    action: 'opened',
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
    reviews: [],
  };

  it('handles manual label changes', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'labeled',
        labelAdded: 'waiting-for:merge',
      }),
    ).toBe('waiting-for:merge');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'unlabeled',
        labelRemoved: 'waiting-for:merge',
      }),
    ).toBe('waiting-for:review');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labels: new Set(['waiting-for:decision']),
        eventName: 'pull_request',
        action: 'labeled',
        labelAdded: 'waiting-for:decision',
      }),
    ).toBe('waiting-for:decision');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labels: new Set(['waiting-for:decision']),
        eventName: 'pull_request',
        action: 'synchronize',
      }),
    ).toBe(null);
  });

  it('handles author actions after needs-changes', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labels: new Set(['waiting-for:author']),
        eventName: 'pull_request',
        action: 'synchronize',
        actor: 'author',
        authorLogin: 'author',
      }),
    ).toBe('waiting-for:review');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        labels: new Set(['waiting-for:author']),
        eventName: 'issue_comment',
        commentAuthor: { login: 'author', type: 'User' },
        authorLogin: 'author',
      }),
    ).toBe('waiting-for:review');
  });

  it('handles review events', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request_review',
        action: 'submitted',
        reviewState: 'APPROVED',
      }),
    ).toBe('waiting-for:merge');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request_review',
        action: 'submitted',
        reviewState: 'CHANGES_REQUESTED',
      }),
    ).toBe('waiting-for:author');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request_review',
        action: 'submitted',
        reviewState: 'APPROVED',
        reviews: [{ state: 'CHANGES_REQUESTED' }],
      }),
    ).toBe('waiting-for:author');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request_review',
        action: 'dismissed',
        reviews: [{ state: 'CHANGES_REQUESTED' }],
      }),
    ).toBe('waiting-for:author');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request_review',
        action: 'dismissed',
        reviews: [{ state: 'APPROVED' }],
      }),
    ).toBe('waiting-for:merge');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request_review',
        action: 'dismissed',
        reviews: [],
      }),
    ).toBe('waiting-for:review');
  });

  it('handles pull request events', () => {
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'opened',
      }),
    ).toBe('waiting-for:review');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'opened',
        reviews: [{ state: 'APPROVED' }],
      }),
    ).toBe('waiting-for:merge');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'opened',
        reviews: [{ state: 'CHANGES_REQUESTED' }],
      }),
    ).toBe('waiting-for:author');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'synchronize',
      }),
    ).toBe('waiting-for:review');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'pull_request',
        action: 'reopened',
      }),
    ).toBe('waiting-for:review');
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
    ).toBe('waiting-for:author');
    expect(
      determineTargetStatusLabel({
        ...baseInput,
        eventName: 'unknown_event',
      }),
    ).toBe(null);
  });
});
