import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { withRetry } from './withRetry';

// Patch setTimeout so retries are instant during tests.
const realSetTimeout = global.setTimeout;

describe('withRetry', () => {
  beforeEach(() => {
    // Make setTimeout fire instantly to keep tests fast.
    (global as any).setTimeout = (fn: () => void) => realSetTimeout(fn, 0);
  });

  afterEach(() => {
    global.setTimeout = realSetTimeout;
  });

  it('returns the result on the first successful attempt', async () => {
    const fn = jest.fn<() => Promise<string>>().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on "socket hang up" and succeeds on second attempt', async () => {
    const socketError = Object.assign(new Error('socket hang up'), {
      code: 'ECONNRESET',
    });
    const fn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(socketError)
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 100 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on ECONNRESET and succeeds on third attempt', async () => {
    const connError = Object.assign(new Error('read ECONNRESET'), {
      code: 'ECONNRESET',
    });
    const fn = jest
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(connError)
      .mockRejectedValueOnce(connError)
      .mockResolvedValue(42);

    const result = await withRetry(fn, { maxAttempts: 5, initialDelayMs: 1 });
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on non-transient errors without retrying', async () => {
    const notFound = new Error('Not Found');
    const fn = jest.fn<() => Promise<string>>().mockRejectedValue(notFound);

    await expect(
      withRetry(fn, { maxAttempts: 5, initialDelayMs: 1 }),
    ).rejects.toThrow('Not Found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('exhausts all attempts and re-throws the last transient error', async () => {
    const hangUp = new Error('socket hang up');
    const fn = jest.fn<() => Promise<string>>().mockRejectedValue(hangUp);

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 }),
    ).rejects.toThrow('socket hang up');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
