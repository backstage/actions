import { foo } from './index';
import { describe, it, expect } from '@jest/globals';

describe('test', () => {
  it('should test', () => {
    expect(foo()).toBe(true);
  });
});
