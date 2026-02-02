import { shouldHaveReviewerApprovedLabel } from './shouldHaveReviewerApprovedLabel';

describe('shouldHaveReviewerApprovedLabel', () => {
  it('returns true when reviewer has approved and false otherwise', () => {
    expect(
      shouldHaveReviewerApprovedLabel(
        [
          {
            state: 'APPROVED',
            submittedAt: '2024-01-01T00:00:00Z',
            authorLogin: 'reviewer',
          },
        ],
        new Set(['reviewer']),
      ),
    ).toBe(true);
    expect(
      shouldHaveReviewerApprovedLabel(
        [
          {
            state: 'COMMENTED',
            submittedAt: '2024-01-01T00:00:00Z',
            authorLogin: 'reviewer',
          },
        ],
        new Set(['reviewer']),
      ),
    ).toBe(false);
    expect(
      shouldHaveReviewerApprovedLabel(
        [
          {
            state: 'APPROVED',
            submittedAt: '2024-01-01T00:00:00Z',
            authorLogin: 'someone',
          },
        ],
        new Set(['reviewer']),
      ),
    ).toBe(false);
    expect(
      shouldHaveReviewerApprovedLabel(
        [
          {
            state: 'APPROVED',
            submittedAt: '2024-01-01T00:00:00Z',
            authorLogin: undefined,
          },
        ],
        new Set(['reviewer']),
      ),
    ).toBe(false);
    expect(
      shouldHaveReviewerApprovedLabel(
        [
          {
            state: 'APPROVED',
            submittedAt: undefined,
            authorLogin: 'reviewer',
          },
        ],
        new Set(['reviewer']),
      ),
    ).toBe(true);
    expect(
      shouldHaveReviewerApprovedLabel(
        [
          {
            state: 'approved',
            submittedAt: '2024-01-01T00:00:00Z',
            authorLogin: 'reviewer',
          },
        ],
        new Set(['reviewer']),
      ),
    ).toBe(true);
    expect(shouldHaveReviewerApprovedLabel([], new Set(['reviewer']))).toBe(
      false,
    );
  });

  it('uses latest review when comparing approvals and changes requested', () => {
    expect(
      shouldHaveReviewerApprovedLabel(
        [
          {
            state: 'APPROVED',
            submittedAt: '2024-01-01T00:00:00Z',
            authorLogin: 'reviewer',
          },
          {
            state: 'CHANGES_REQUESTED',
            submittedAt: '2024-01-02T00:00:00Z',
            authorLogin: 'someone',
          },
          {
            state: 'APPROVED',
            submittedAt: '2024-01-03T00:00:00Z',
            authorLogin: 'reviewer',
          },
        ],
        new Set(['reviewer']),
      ),
    ).toBe(true);
    expect(
      shouldHaveReviewerApprovedLabel(
        [
          {
            state: 'APPROVED',
            submittedAt: '2024-01-01T00:00:00Z',
            authorLogin: 'reviewer',
          },
          {
            state: 'CHANGES_REQUESTED',
            submittedAt: '2024-01-02T00:00:00Z',
            authorLogin: 'someone',
          },
        ],
        new Set(['reviewer']),
      ),
    ).toBe(false);
    expect(
      shouldHaveReviewerApprovedLabel(
        [
          {
            state: 'APPROVED',
            submittedAt: '2024-01-01T00:00:00Z',
            authorLogin: 'reviewer1',
          },
          {
            state: 'APPROVED',
            submittedAt: '2024-01-02T00:00:00Z',
            authorLogin: 'reviewer2',
          },
        ],
        new Set(['reviewer1', 'reviewer2']),
      ),
    ).toBe(true);
  });
});
