import {
  calculatePriority,
  CalculatePriorityOptions,
} from './calculatePriority';

const defaultParams = {
  base: 100,
  exponentBase: 0.5,
  exponentOffset: 0,
  exponentDivisor: 500,
  reviewerBump: 100,
};

function calc(overrides: Partial<CalculatePriorityOptions> = {}) {
  return calculatePriority({
    additions: 0,
    priorityParams: defaultParams,
    reviewerApproved: false,
    authorScore: 0,
    reviews: [],
    isDraft: false,
    checkRuns: [],
    requiredChecks: [],
    ...overrides,
  });
}

describe('calculatePriority', () => {
  // 0 lines → 100, 500 lines → ~50, 5000 lines → 0
  it('calculates expected priority values based on PR size', () => {
    expect(calc({ additions: 0 })).toBe(100);
    expect(calc({ additions: 500 })).toBe(50);
    expect(calc({ additions: 5000 })).toBe(0);
  });

  it('adds reviewer bump to priority', () => {
    expect(calc({ additions: 500, reviewerApproved: true })).toBe(
      calc({ additions: 500 }) + 100,
    );
  });

  it('clamps base priority between 0 and base', () => {
    const priorityParams = { ...defaultParams, base: 50 };

    expect(calc({ additions: 0, priorityParams })).toBe(50);
    expect(calc({ additions: 5000, priorityParams })).toBe(0);
  });

  it('adds author score to priority', () => {
    expect(calc({ authorScore: 30 })).toBe(130);
  });

  it('adds copilot review priority', () => {
    expect(
      calc({
        reviews: [
          {
            state: 'COMMENTED',
            submittedAt: '2024-01-01T12:00:00Z',
            authorLogin: 'copilot-pull-request-reviewer',
            body: '<!-- priority: 75 -->',
          },
        ],
      }),
    ).toBe(175);
  });

  it('applies draft multiplier', () => {
    expect(calc({ isDraft: true })).toBe(20);
  });

  it('applies checks multiplier for failing checks', () => {
    expect(
      calc({
        checkRuns: [{ name: 'CI', status: 'COMPLETED', conclusion: 'FAILURE' }],
        requiredChecks: ['CI'],
      }),
    ).toBe(50);
  });

  it('applies all modifiers together in the correct order', () => {
    // base: 100 (0 additions) + reviewer bump 100 + author 20 + copilot 75 = 295
    // then draft ×0.2 = 59, checks ×0.5 = 29.5 → 30
    expect(
      calc({
        reviewerApproved: true,
        authorScore: 20,
        reviews: [
          {
            state: 'COMMENTED',
            submittedAt: '2024-01-01T12:00:00Z',
            authorLogin: 'copilot-pull-request-reviewer',
            body: '<!-- priority: 75 -->',
          },
        ],
        isDraft: true,
        checkRuns: [{ name: 'CI', status: 'COMPLETED', conclusion: 'FAILURE' }],
        requiredChecks: ['CI'],
      }),
    ).toBe(30);
  });
});
