/**
 * Shared RPC Client Utility
 *
 * Provides standardized RPC calling patterns with consistent error handling,
 * response validation, and logging across all service files.
 */

import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type { ServiceResponse } from './errorHandler';
import { handleError, handleSuccess } from './errorHandler';
import { createLogger } from './logger';
import { localizeDigits, t } from '@/i18n';
import { serverText } from '@/utils/serverText';

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
 * Options for RPC calls
 */
export interface RPCOptions {
  /** Context name for logging (e.g., 'GRN Service') */
  context: string;
  /** Custom error message for user-facing errors */
  errorMessage?: string;
  /** Enable performance timing logs */
  enableTiming?: boolean;
  /** Enable detailed logging */
  verbose?: boolean;
  /** Timeout in milliseconds (default: 30000 for list fetches) */
  timeout?: number;
}

// E4 Fix: Default timeouts for different operation types
export const RPC_TIMEOUTS = {
  LIST_FETCH: 30000,    // 30 seconds for list fetches
  MUTATION: 60000,      // 60 seconds for create/update/delete
  QUICK_CHECK: 10000,   // 10 seconds for simple checks
} as const;

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

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string = 'Operation'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(
          t('errors.network.timedOutAfter', { context, seconds: localizeDigits(String(timeoutMs / 1000)) }),
          timeoutMs
        ));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Execute an RPC function call with standardized error handling
 *
 * @example
 * const result = await callRPC<GRNListResponse>(
 *   'get_all_grn_items',
 *   { p_limit: 20, p_offset: 0 },
 *   { context: 'GRN Service', enableTiming: true }
 * );
 */
export async function callRPC<TData = unknown>(
  functionName: string,
  params: Record<string, unknown> = {},
  options: RPCOptions
): Promise<ServiceResponse<TData>> {
  const {
    context,
    errorMessage,
    enableTiming = false,
    verbose = false,
    timeout = RPC_TIMEOUTS.LIST_FETCH  // E4 Fix: Default 30s timeout
  } = options;

  try {
    // Get authenticated client
    const authenticatedClient = await getAuthenticatedClient();

    // Log RPC call if verbose
    if (verbose) {
      rpcLogger.info(`[${context}] Calling RPC: ${functionName}`, { params });
    }

    // Start timing if enabled
    const startTime = enableTiming ? Date.now() : 0;

    // E4 Fix: Execute RPC call with timeout wrapper
    // Wrap PostgrestFilterBuilder in Promise.resolve() for timeout wrapper compatibility
    const rpcPromise = Promise.resolve(authenticatedClient.rpc(functionName, params));
    const { data, error } = await withTimeout<{ data: unknown; error: { message: string } | null }>(
      rpcPromise,
      timeout,
      `RPC ${functionName}`
    );

    // Log timing if enabled
    if (enableTiming) {
      const duration = Date.now() - startTime;
      rpcLogger.info(`[${context}] RPC ${functionName} completed in ${duration}ms`);
    }

    // Log data size if verbose and data exists
    if (verbose && data) {
      const dataSize = JSON.stringify(data).length;
      rpcLogger.info(`[${context}] Response size: ${(dataSize / 1024).toFixed(2)} KB`);
    }

    // Handle RPC errors
    if (error) {
      rpcLogger.error(`[${context}] RPC error in ${functionName}:`, error.message);
      return handleError(
        error,
        context,
        { defaultMessage: errorMessage || t('errors.general.executeFailed', { name: functionName }) }
      );
    }

    // Handle missing data
    if (!data) {
      return handleError(
        new Error(t('errors.general.noDataFromRpc')),
        context,
        { defaultMessage: errorMessage || t('errors.general.noDataAvailable') }
      );
    }

    // Handle backend-level errors (when RPC succeeds but backend returns error)
    const rpcResponse = Array.isArray(data) ? data[0] : data;
    if (rpcResponse && typeof rpcResponse === 'object' && 'success' in rpcResponse) {
      if (rpcResponse.success === false) {
        return {
          success: false,
          message: serverText(rpcResponse.message || errorMessage, t('errors.general.operationFailed')),
          error: serverText(rpcResponse.error, t('errors.general.backendReturnedError')),
        };
      }
    }

    // Success - return data
    return handleSuccess(
      rpcResponse as TData,
      rpcResponse && typeof rpcResponse === 'object' && 'message' in rpcResponse
        ? (rpcResponse.message as string)
        : t('errors.general.operationCompleted')
    );
  } catch (error) {
    // E4 Fix: Handle timeout errors with specific message
    if (error instanceof TimeoutError) {
      rpcLogger.error(`[${context}] Request timeout in ${functionName}:`, error.message);
      return {
        success: false,
        message: t('errors.network.requestTimedOut'),
        error: error.message,
      };
    }
    return handleError(
      error,
      context,
      { defaultMessage: errorMessage || t('errors.general.unexpected') }
    );
  }
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
