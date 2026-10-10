/**
 * Shared RPC helpers: the response shape, pagination and parameter cleaning.
 *
 * The time limit of a request is not here: every request is limited where it
 * is sent (`gatedFetch` in `@/config/supabaseConfig`). The `callRPC` wrapper
 * that used to carry a limit was called by no screen or service and is gone.
 */

import { createLogger } from './logger';
import { localizeDigits, t } from '@/i18n';

const rpcLogger = createLogger('RPCClient');

/**
 * Standard RPC response from backend functions
 */
export interface RPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    total?: number;
    total_count?: number;
    totalCount?: number;
    limit: number;
    offset: number;
    has_more?: boolean;
    hasMore?: boolean;
  };
  aggregates?: Record<string, unknown>;
  [key: string]: unknown; // Allow additional fields
}

/**
 * E4 Fix: Wrap a promise with a timeout
 * Rejects with TimeoutError if promise doesn't resolve within specified time
 */
export class TimeoutError extends Error {
  /** Read by error handling instead of the message, which is translated. */
  readonly appErrorCode = 'TIMEOUT' as const;

  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * The timer is cleared as soon as the promise settles. `onTimeout` runs when
 * the time is up, before the rejection, so the caller can abort what it has
 * stopped waiting for.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string = 'Operation',
  onTimeout?: () => void
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        try {
          onTimeout?.();
        } finally {
          reject(new TimeoutError(
            t('errors.network.timedOutAfter', { context, seconds: localizeDigits(String(timeoutMs / 1000)) }),
            timeoutMs
          ));
        }
      }, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Extract pagination data from RPC response
 * Handles both snake_case and camelCase field names
 */
export function extractPagination(
  response: RPCResponse<unknown>,
  defaultLimit = 20,
  defaultOffset = 0
): {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
} {
  const rawPagination = response.pagination;

  if (!rawPagination) {
    return {
      total: 0,
      limit: defaultLimit,
      offset: defaultOffset,
      hasMore: false,
    };
  }

  const total =
    rawPagination.totalCount ||
    rawPagination.total_count ||
    rawPagination.total ||
    0;

  const limit = rawPagination.limit || defaultLimit;
  const offset = rawPagination.offset || defaultOffset;

  // Calculate hasMore if not provided
  const hasMore =
    rawPagination.has_more ??
    rawPagination.hasMore ??
    offset + limit < total;

  return {
    total,
    limit,
    offset,
    hasMore,
  };
}

/**
 * Validate UUID parameter
 * Returns null for invalid UUIDs to safely pass to RPC functions
 */
export function validateUUIDParam(id: string | undefined | null, fieldName = 'ID'): string | null {
  if (!id || id === 'undefined' || id === 'null') {
    return null;
  }

  // Basic UUID format check
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(id)) {
    rpcLogger.warn(`Invalid ${fieldName} format:`, id);
    return null;
  }

  return id;
}

/**
 * Clean RPC parameters by removing undefined/null values
 * Supabase RPC functions work better when optional params are omitted entirely
 */
export function cleanRPCParams<T extends Record<string, unknown>>(params: T): Partial<T> {
  const cleaned: Partial<T> = {};

  for (const [key, value] of Object.entries(params)) {
    // Keep false, 0, and empty strings but remove null/undefined
    if (value !== null && value !== undefined) {
      cleaned[key as keyof T] = value as T[keyof T];
    }
  }

  return cleaned;
}
