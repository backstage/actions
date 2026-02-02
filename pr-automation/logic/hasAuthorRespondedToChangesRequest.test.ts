import { hasAuthorRespondedToChangesRequest } from './hasAuthorRespondedToChangesRequest';
import { Review, Comment } from '../types';

describe('hasAuthorRespondedToChangesRequest', () => {
  it('returns false when no author login is provided', () => {
    const reviews: Review[] = [
      { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T12:00:00Z' },
    ];
    const comments: Comment[] = [
      { authorLogin: 'author', createdAt: '2024-01-02T12:00:00Z' },
    ];

    expect(
      hasAuthorRespondedToChangesRequest(reviews, comments, undefined),
    ).toBe(false);
  });

  it('returns false when there are no changes requested reviews', () => {
    const reviews: Review[] = [
      { state: 'APPROVED', submittedAt: '2024-01-01T12:00:00Z' },
      { state: 'COMMENTED', submittedAt: '2024-01-01T13:00:00Z' },
    ];
    const comments: Comment[] = [
      { authorLogin: 'author', createdAt: '2024-01-02T12:00:00Z' },
    ];

    expect(
      hasAuthorRespondedToChangesRequest(reviews, comments, 'author'),
    ).toBe(false);
  });

  it('returns false when there are no author comments', () => {
    const reviews: Review[] = [
      { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T12:00:00Z' },
    ];
    const comments: Comment[] = [
      { authorLogin: 'someone-else', createdAt: '2024-01-02T12:00:00Z' },
    ];

    expect(
      hasAuthorRespondedToChangesRequest(reviews, comments, 'author'),
    ).toBe(false);
  });

  it('returns false when author comment is older than changes request', () => {
    const reviews: Review[] = [
      { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-02T12:00:00Z' },
    ];
    const comments: Comment[] = [
      { authorLogin: 'author', createdAt: '2024-01-01T12:00:00Z' },
    ];

    expect(
      hasAuthorRespondedToChangesRequest(reviews, comments, 'author'),
    ).toBe(false);
  });

  it('returns true when author comment is newer than changes request', () => {
    const reviews: Review[] = [
      { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T12:00:00Z' },
    ];
    const comments: Comment[] = [
      { authorLogin: 'author', createdAt: '2024-01-02T12:00:00Z' },
    ];

    expect(
      hasAuthorRespondedToChangesRequest(reviews, comments, 'author'),
    ).toBe(true);
  });

  it('uses the most recent changes request when there are multiple', () => {
    const reviews: Review[] = [
      { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T12:00:00Z' },
      { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-03T12:00:00Z' },
    ];
    const comments: Comment[] = [
      { authorLogin: 'author', createdAt: '2024-01-02T12:00:00Z' },
    ];

    // Author commented after first changes request but before second
    expect(
      hasAuthorRespondedToChangesRequest(reviews, comments, 'author'),
    ).toBe(false);
  });

  it('uses the most recent author comment when there are multiple', () => {
    const reviews: Review[] = [
      { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-02T12:00:00Z' },
    ];
    const comments: Comment[] = [
      { authorLogin: 'author', createdAt: '2024-01-01T12:00:00Z' },
      { authorLogin: 'author', createdAt: '2024-01-03T12:00:00Z' },
    ];

    // Most recent author comment is after changes request
    expect(
      hasAuthorRespondedToChangesRequest(reviews, comments, 'author'),
    ).toBe(true);
  });

  it('ignores reviews without submittedAt', () => {
    const reviews: Review[] = [
      { state: 'CHANGES_REQUESTED' }, // No submittedAt
      { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T12:00:00Z' },
    ];
    const comments: Comment[] = [
      { authorLogin: 'author', createdAt: '2024-01-02T12:00:00Z' },
    ];

    expect(
      hasAuthorRespondedToChangesRequest(reviews, comments, 'author'),
    ).toBe(true);
  });

  it('ignores comments without createdAt', () => {
    const reviews: Review[] = [
      { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T12:00:00Z' },
    ];
    const comments: Comment[] = [
      { authorLogin: 'author' }, // No createdAt
    ];

    expect(
      hasAuthorRespondedToChangesRequest(reviews, comments, 'author'),
    ).toBe(false);
  });

  it('handles empty reviews array', () => {
    const reviews: Review[] = [];
    const comments: Comment[] = [
      { authorLogin: 'author', createdAt: '2024-01-02T12:00:00Z' },
    ];

    expect(
      hasAuthorRespondedToChangesRequest(reviews, comments, 'author'),
    ).toBe(false);
  });

  it('handles empty comments array', () => {
    const reviews: Review[] = [
      { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T12:00:00Z' },
    ];
    const comments: Comment[] = [];

    expect(
      hasAuthorRespondedToChangesRequest(reviews, comments, 'author'),
    ).toBe(false);
  });
});
