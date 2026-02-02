import { calculateSizeLabel } from './calculateSizeLabel';

describe('calculateSizeLabel', () => {
  it('selects correct size labels for all thresholds', () => {
    expect(calculateSizeLabel(0)).toBe('size:tiny');
    expect(calculateSizeLabel(3)).toBe('size:tiny');
    expect(calculateSizeLabel(5)).toBe('size:tiny');
    expect(calculateSizeLabel(6)).toBe('size:small');
    expect(calculateSizeLabel(20)).toBe('size:small');
    expect(calculateSizeLabel(50)).toBe('size:small');
    expect(calculateSizeLabel(51)).toBe('size:medium');
    expect(calculateSizeLabel(250)).toBe('size:medium');
    expect(calculateSizeLabel(500)).toBe('size:medium');
    expect(calculateSizeLabel(501)).toBe('size:large');
    expect(calculateSizeLabel(1000)).toBe('size:large');
    expect(calculateSizeLabel(2500)).toBe('size:large');
    expect(calculateSizeLabel(2501)).toBe('size:huge');
    expect(calculateSizeLabel(5000)).toBe('size:huge');
    expect(calculateSizeLabel(10000)).toBe('size:huge');
  });
});
