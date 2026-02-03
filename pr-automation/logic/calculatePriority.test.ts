import { calculatePriority } from './calculatePriority';

describe('calculatePriority', () => {
  // 0 lines → 100, 500 lines → ~50, 5000 lines → 0
  const defaultParams = {
    base: 100,
    exponentBase: 0.5,
    exponentOffset: 0,
    exponentDivisor: 500,
    min: 0,
    max: 100,
    reviewerBump: 100,
  };

  it('calculates expected priority values based on PR size', () => {
    expect(calculatePriority(0, defaultParams, false)).toBe(100);
    expect(calculatePriority(500, defaultParams, false)).toBe(50);
    expect(calculatePriority(5000, defaultParams, false)).toBe(0);
  });

  it('adds reviewer bump to priority', () => {
    const priorityWithoutBump = calculatePriority(500, defaultParams, false);
    const priorityWithBump = calculatePriority(500, defaultParams, true);

    expect(priorityWithBump).toBe(priorityWithoutBump + 100);
  });

  it('respects min and max bounds', () => {
    const paramsWithTightBounds = {
      ...defaultParams,
      min: 10,
      max: 50,
    };

    expect(calculatePriority(0, paramsWithTightBounds, false)).toBe(50);
    expect(calculatePriority(5000, paramsWithTightBounds, false)).toBe(10);
  });
});
