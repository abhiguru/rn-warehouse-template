/**
 * Retry utility with exponential backoff for transient failures.
 *
 * E6 Fix: Implements retry logic for RPC calls.
 *
 * Usage:
 *   const result = await withRetry(
 *     () => supabase.rpc('my_function', params),
 *     { maxRetries: 3, context: 'myFunction' }
 *   );
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Context string for logging */
  context?: string;
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'isRetryable'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  context: 'Operation',
};

/**
 * Default retryable error check.
 * Retries on: network errors, 5xx errors, timeouts.
 * Does NOT retry on: 4xx errors (client errors), auth failures.
 */
function defaultIsRetryable(error: unknown): boolean {
  if (!error) return false;

  // Network errors (no response)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Timeout errors from our withTimeout utility
  if (error instanceof Error && error.name === 'TimeoutError') {
    return true;
  }

  // Check for error objects with status/code
  const errorObj = error as Record<string, unknown>;

  // Supabase/PostgrestError structure
  const status = errorObj.status ?? errorObj.code ?? errorObj.statusCode;

  if (typeof status === 'number') {
    // Retry on 5xx server errors
    if (status >= 500 && status < 600) return true;
    // Retry on 408 Request Timeout
    if (status === 408) return true;
    // Retry on 429 Too Many Requests (rate limit)
    if (status === 429) return true;
    // Don't retry on 4xx client errors (except above)
    if (status >= 400 && status < 500) return false;
  }

  // Check error message for common retryable patterns
  const message =
    errorObj.message ?? errorObj.error ?? errorObj.error_description;
  if (typeof message === 'string') {
    const retryablePatterns = [
      'network',
      'timeout',
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'socket hang up',
      'connection refused',
      'temporarily unavailable',
      'service unavailable',
      'internal server error',
      'bad gateway',
      'gateway timeout',
    ];
    const lowerMessage = message.toLowerCase();
    if (retryablePatterns.some((pattern) => lowerMessage.includes(pattern))) {
      return true;
    }

    // Don't retry on auth errors
    const authPatterns = [
      'unauthorized',
      'unauthenticated',
      'invalid token',
      'expired token',
      'jwt',
      'forbidden',
      'access denied',
    ];
    if (authPatterns.some((pattern) => lowerMessage.includes(pattern))) {
      return false;
    }
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number
): number {
  const exponentialDelay =
    initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, cappedDelay + jitter);
}

/**
 * Execute an async operation with retry logic and exponential backoff.
 *
 * @param operation - Async function to execute
 * @param options - Retry configuration options
 * @returns Promise that resolves with operation result or rejects after all retries exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const isRetryable = options.isRetryable ?? defaultIsRetryable;

  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we've exhausted retries
      if (attempt > config.maxRetries) {
        if (__DEV__) {
          console.warn(
            `[withRetry] ${config.context} failed after ${config.maxRetries} retries:`,
            error
          );
        }
        throw error;
      }

      // Check if error is retryable
      if (!isRetryable(error)) {
        if (__DEV__) {
          console.log(
            `[withRetry] ${config.context} failed with non-retryable error:`,
            error
          );
        }
        throw error;
      }

      // Calculate and apply backoff delay
      const delay = calculateDelay(
        attempt,
        config.initialDelayMs,
        config.maxDelayMs,
        config.backoffMultiplier
      );

      if (__DEV__) {
        console.log(
          `[withRetry] ${config.context} attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`
        );
      }

      await sleep(delay);
    }
  }

  // This should not be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Wrapper for Supabase RPC calls with retry logic.
 * Handles Supabase-specific error structures.
 *
 * @param rpcCall - Function that returns Supabase RPC call
 * @param options - Retry configuration options
 * @returns Promise with RPC result
 */
export async function withRetryRpc<T>(
  rpcCall: () => Promise<{ data: T | null; error: unknown }>,
  options: RetryOptions = {}
): Promise<{ data: T | null; error: unknown }> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const isRetryable = options.isRetryable ?? defaultIsRetryable;

  let lastResult: { data: T | null; error: unknown } = { data: null, error: null };

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    const result = await rpcCall();
    lastResult = result;

    // Success - no error
    if (!result.error) {
      return result;
    }

    // Check if we've exhausted retries
    if (attempt > config.maxRetries) {
      if (__DEV__) {
        console.warn(
          `[withRetryRpc] ${config.context} failed after ${config.maxRetries} retries:`,
          result.error
        );
      }
      return result;
    }

    // Check if error is retryable
    if (!isRetryable(result.error)) {
      if (__DEV__) {
        console.log(
          `[withRetryRpc] ${config.context} failed with non-retryable error:`,
          result.error
        );
      }
      return result;
    }

    // Calculate and apply backoff delay
    const delay = calculateDelay(
      attempt,
      config.initialDelayMs,
      config.maxDelayMs,
      config.backoffMultiplier
    );

    if (__DEV__) {
      console.log(
        `[withRetryRpc] ${config.context} attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`
      );
    }

    await sleep(delay);
  }

  return lastResult;
}
