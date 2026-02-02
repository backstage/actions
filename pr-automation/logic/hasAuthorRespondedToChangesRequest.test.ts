import { hasAuthorRespondedToChangesRequest } from './hasAuthorRespondedToChangesRequest';
import { Review, Comment } from '../types';

describe('hasAuthorRespondedToChangesRequest', () => {
  describe('via comments', () => {
    it('returns false when no author login is provided and no head commit date', () => {
      const reviews: Review[] = [
        { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T12:00:00Z' },
      ];
      const comments: Comment[] = [
        { authorLogin: 'author', createdAt: '2024-01-02T12:00:00Z' },
      ];

      expect(
        hasAuthorRespondedToChangesRequest(
          reviews,
          comments,
          undefined,
          undefined,
        ),
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

  describe('via new commits', () => {
    it('returns true when head commit is newer than changes request', () => {
      const reviews: Review[] = [
        { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T12:00:00Z' },
      ];
      const comments: Comment[] = [];

      expect(
        hasAuthorRespondedToChangesRequest(
          reviews,
          comments,
          undefined,
          '2024-01-02T12:00:00Z',
        ),
      ).toBe(true);
    });

    it('returns false when head commit is older than changes request', () => {
      const reviews: Review[] = [
        { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-02T12:00:00Z' },
      ];
      const comments: Comment[] = [];

      expect(
        hasAuthorRespondedToChangesRequest(
          reviews,
          comments,
          undefined,
          '2024-01-01T12:00:00Z',
        ),
      ).toBe(false);
    });

    it('uses the most recent changes request when comparing with head commit', () => {
      const reviews: Review[] = [
        { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T12:00:00Z' },
        { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-03T12:00:00Z' },
      ];
      const comments: Comment[] = [];

      // Head commit is after first changes request but before second
      expect(
        hasAuthorRespondedToChangesRequest(
          reviews,
          comments,
          undefined,
          '2024-01-02T12:00:00Z',
        ),
      ).toBe(false);
    });

    it('returns true when head commit is newer even without author login', () => {
      const reviews: Review[] = [
        { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T12:00:00Z' },
      ];
      const comments: Comment[] = [];

      // No author login, but head commit is newer
      expect(
        hasAuthorRespondedToChangesRequest(
          reviews,
          comments,
          undefined,
          '2024-01-02T12:00:00Z',
        ),
      ).toBe(true);
    });
  });

  describe('combined scenarios', () => {
    it('returns true if either comment or commit is newer than changes request', () => {
      const reviews: Review[] = [
        { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-02T12:00:00Z' },
      ];
      const comments: Comment[] = [
        { authorLogin: 'author', createdAt: '2024-01-01T12:00:00Z' }, // Old comment
      ];

      // Comment is old but head commit is new
      expect(
        hasAuthorRespondedToChangesRequest(
          reviews,
          comments,
          'author',
          '2024-01-03T12:00:00Z',
        ),
      ).toBe(true);
    });

    it('returns true if comment is newer even if commit is older', () => {
      const reviews: Review[] = [
        { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-02T12:00:00Z' },
      ];
      const comments: Comment[] = [
        { authorLogin: 'author', createdAt: '2024-01-03T12:00:00Z' }, // New comment
      ];

      // Head commit is old but comment is new
      expect(
        hasAuthorRespondedToChangesRequest(
          reviews,
          comments,
          'author',
          '2024-01-01T12:00:00Z',
        ),
      ).toBe(true);
    });

    it('returns false if both comment and commit are older than changes request', () => {
      const reviews: Review[] = [
        { state: 'CHANGES_REQUESTED', submittedAt: '2024-01-03T12:00:00Z' },
      ];
      const comments: Comment[] = [
        { authorLogin: 'author', createdAt: '2024-01-01T12:00:00Z' },
      ];

      expect(
        hasAuthorRespondedToChangesRequest(
          reviews,
          comments,
          'author',
          '2024-01-02T12:00:00Z',
        ),
      ).toBe(false);
    });
  });
});
