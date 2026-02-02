import { getCopilotReviewPriority } from './getCopilotReviewPriority';
import { Review } from '../types';

const COPILOT_LOGIN = 'copilot-pull-request-reviewer[bot]';

describe('getCopilotReviewPriority', () => {
  it('returns 0 when there are no reviews', () => {
    expect(getCopilotReviewPriority([])).toBe(0);
  });

  it('returns 0 when there are no Copilot reviews', () => {
    const reviews: Review[] = [
      {
        state: 'APPROVED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: 'human-reviewer',
        body: '<!-- priority: 50 -->',
      },
    ];

    expect(getCopilotReviewPriority(reviews)).toBe(0);
  });

  it('returns 0 when Copilot review has no body', () => {
    const reviews: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
      },
    ];

    expect(getCopilotReviewPriority(reviews)).toBe(0);
  });

  it('returns 0 when Copilot review has no priority comment', () => {
    const reviews: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: 'This PR looks good!',
      },
    ];

    expect(getCopilotReviewPriority(reviews)).toBe(0);
  });

  it('extracts priority from Copilot review', () => {
    const reviews: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '## Review\n<!-- priority: 75 -->\nThis PR adds a feature.',
      },
    ];

    expect(getCopilotReviewPriority(reviews)).toBe(75);
  });

  it('handles priority at boundaries (0 and 100)', () => {
    const reviewsWithZero: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- priority: 0 -->',
      },
    ];

    const reviewsWithHundred: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- priority: 100 -->',
      },
    ];

    expect(getCopilotReviewPriority(reviewsWithZero)).toBe(0);
    expect(getCopilotReviewPriority(reviewsWithHundred)).toBe(100);
  });

  it('returns 0 for priority values outside 0-100 range', () => {
    const reviewsNegative: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- priority: -5 -->',
      },
    ];

    const reviewsOver100: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- priority: 150 -->',
      },
    ];

    expect(getCopilotReviewPriority(reviewsNegative)).toBe(0);
    expect(getCopilotReviewPriority(reviewsOver100)).toBe(0);
  });

  it('returns 0 for non-integer priority values', () => {
    const reviewsDecimal: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- priority: 50.5 -->',
      },
    ];

    const reviewsText: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- priority: high -->',
      },
    ];

    expect(getCopilotReviewPriority(reviewsDecimal)).toBe(0);
    expect(getCopilotReviewPriority(reviewsText)).toBe(0);
  });

  it('uses the most recent Copilot review when there are multiple', () => {
    const reviews: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- priority: 30 -->',
      },
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-03T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- priority: 80 -->',
      },
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-02T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- priority: 50 -->',
      },
    ];

    expect(getCopilotReviewPriority(reviews)).toBe(80);
  });

  it('ignores Copilot reviews without submittedAt', () => {
    const reviews: Review[] = [
      {
        state: 'COMMENTED',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- priority: 99 -->',
      },
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- priority: 25 -->',
      },
    ];

    expect(getCopilotReviewPriority(reviews)).toBe(25);
  });

  it('handles priority comment with varying whitespace', () => {
    const reviews: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!--priority:42-->',
      },
    ];

    expect(getCopilotReviewPriority(reviews)).toBe(42);

    const reviewsWithSpaces: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!--   priority:   55   -->',
      },
    ];

    expect(getCopilotReviewPriority(reviewsWithSpaces)).toBe(55);
  });

  it('handles case-insensitive priority keyword', () => {
    const reviews: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- PRIORITY: 60 -->',
      },
    ];

    expect(getCopilotReviewPriority(reviews)).toBe(60);

    const reviewsMixed: Review[] = [
      {
        state: 'COMMENTED',
        submittedAt: '2024-01-01T12:00:00Z',
        authorLogin: COPILOT_LOGIN,
        body: '<!-- Priority: 70 -->',
      },
    ];

    expect(getCopilotReviewPriority(reviewsMixed)).toBe(70);
  });
});
