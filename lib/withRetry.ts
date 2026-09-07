/**
 * Transient error patterns that should trigger a retry.
 * These typically indicate temporary network-level failures.
 */
const RETRYABLE_PATTERNS = [
  'socket hang up',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
];

export interface RetryOptions {
  /** Maximum number of attempts including the first try (default: 5) */
  maxAttempts?: number;
  /** Delay before the first retry in milliseconds; doubles on each attempt (default: 500) */
  initialDelayMs?: number;
}

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  const code = (error as NodeJS.ErrnoException).code;
  return RETRYABLE_PATTERNS.some(
    p => msg.includes(p) || (typeof code === 'string' && code.includes(p)),
  );
}

/**
 * Retries an async function with exponential backoff on transient network
 * errors (e.g. "socket hang up", ECONNRESET). Re-throws immediately for
 * non-transient errors or once maxAttempts is exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 5, initialDelayMs = 500 } = options;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isTransientError(error) || attempt === maxAttempts) {
        throw error;
      }
      await new Promise(resolve =>
        setTimeout(resolve, initialDelayMs * 2 ** (attempt - 1)),
      );
    }
  }
  // This line is never reached; the loop always returns or throws.
  /* istanbul ignore next */
  throw new Error('withRetry: unexpected end of loop');
}
