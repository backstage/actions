import { calculatePriority } from './calculatePriority';

describe('calculatePriority', () => {
  const defaultParams = {
    base: 100,
    exponentBase: 0.5,
    exponentOffset: 1,
    exponentDivisor: 99,
    min: 0,
    max: 100,
    reviewerBump: 100,
  };

  it('calculates priority within bounds and adds reviewer bump', () => {
    const priorityWithoutBump = calculatePriority(5, defaultParams, false);
    const priorityWithBump = calculatePriority(5, defaultParams, true);

    expect(priorityWithoutBump).toBeGreaterThanOrEqual(0);
    expect(priorityWithoutBump).toBeLessThanOrEqual(100);
    expect(priorityWithBump).toBe(priorityWithoutBump + 100);
    expect(priorityWithBump).toBeGreaterThanOrEqual(100);
  });

  it('respects min and max bounds and handles edge cases', () => {
    const paramsWithTightBounds = {
      ...defaultParams,
      min: 10,
      max: 50,
    };
    const priorityHigh = calculatePriority(1000, paramsWithTightBounds, false);
    const priorityZero = calculatePriority(0, defaultParams, false);
    const priorityVeryHigh = calculatePriority(100000, defaultParams, false);

    expect(priorityHigh).toBeGreaterThanOrEqual(10);
    expect(priorityHigh).toBeLessThanOrEqual(50);
    expect(priorityZero).toBeGreaterThanOrEqual(0);
    expect(priorityZero).toBeLessThanOrEqual(100);
    expect(priorityVeryHigh).toBeGreaterThanOrEqual(0);
    expect(priorityVeryHigh).toBeLessThanOrEqual(100);
  });
});
