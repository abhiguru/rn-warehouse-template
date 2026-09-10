/**
 * Service Error Handler
 *
 * Provides centralized error categorization and handling for all services.
 * Extends the base errorHandler with service-specific categorization.
 *
 * Issue #8: Add centralized error categorization utility
 */

import { createLogger } from './logger';
import type { ServiceResponse, ServiceListResponse } from '../types/service.types';
import { createEmptyListResponse } from '../types/service.types';

const logger = createLogger('ServiceErrorHandler');

// Lazy import to avoid circular dependency
let _store: typeof import('@/store').store | null = null;
let _forceLogoutOnInvalidToken: typeof import('@/store/slices/authSlice').forceLogoutOnInvalidToken | null = null;

const getStore = () => {
  if (!_store) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _store = require('@/store').store;
  }
  return _store;
};

const getForceLogoutAction = () => {
  if (!_forceLogoutOnInvalidToken) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _forceLogoutOnInvalidToken = require('@/store/slices/authSlice').forceLogoutOnInvalidToken;
  }
  return _forceLogoutOnInvalidToken;
};

/**
 * Global handler for auth errors - forces logout when detected
 * Called automatically by createErrorResponse and executeRPC
 */
export function handleGlobalAuthError(error: unknown): void {
  if (isJWTSignatureError(error)) {
    console.warn('[ServiceErrorHandler] Auth error detected globally - forcing logout');
    try {
      const store = getStore();
      const forceLogout = getForceLogoutAction();
      if (store && forceLogout) {
        store.dispatch(forceLogout('Authentication failed. Please sign in again.'));
      }
    } catch (e) {
      console.error('[ServiceErrorHandler] Failed to dispatch logout:', e);
    }
  }
}

/**
 * Error categories for service errors
 */
export type ErrorCategory = 'network' | 'auth' | 'server' | 'validation' | 'timeout' | 'unknown';

/**
 * Detailed error information for categorized errors
 */
export interface CategorizedError {
  type: ErrorCategory;
  category: ErrorCategory;
  code?: string;
  message: string;
  userMessage: string;
  retryable: boolean;
  httpStatus?: number;
  shouldLogout?: boolean;
  shouldRetry?: boolean;
  retryAfterMs?: number;
  originalError?: unknown;
}

/**
 * User-friendly error messages by category
 */
const USER_MESSAGES: Record<ErrorCategory, string> = {
  network: 'Unable to connect. Please check your internet connection and try again.',
  auth: 'Your session has expired. Please sign in again.',
  server: 'Something went wrong on our end. Please try again later.',
  validation: 'The information provided is invalid. Please check and try again.',
  timeout: 'The request took too long. Please try again.',
  unknown: 'An unexpected error occurred. Please try again.',
};

/**
 * Categorize an error based on its type and message
 */
export function categorizeError(error: unknown): CategorizedError {
  let category: ErrorCategory = 'unknown';
  let httpStatus: number | undefined;
  let shouldLogout = false;
  let retryable = false;
  let message = 'An unexpected error occurred';

  if (error instanceof Error) {
    message = error.message;
    const lowerMessage = message.toLowerCase();

    // Network errors
    if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('fetch failed') ||
      lowerMessage.includes('connection') ||
      lowerMessage.includes('econnrefused') ||
      lowerMessage.includes('econnreset') ||
      lowerMessage.includes('dns') ||
      lowerMessage.includes('socket')
    ) {
      category = 'network';
      retryable = true;
    }
    // Timeout errors
    else if (
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('etimedout') ||
      lowerMessage.includes('timed out')
    ) {
      category = 'timeout';
      retryable = true;
    }
    // Auth errors
    else if (
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('401') ||
      lowerMessage.includes('jwt expired') ||
      lowerMessage.includes('invalid token') ||
      lowerMessage.includes('session expired') ||
      lowerMessage.includes('jwsinvalidsignature') ||
      lowerMessage.includes('jws') ||
      lowerMessage.includes('invalid signature')
    ) {
      category = 'auth';
      httpStatus = 401;
      shouldLogout = true;
      retryable = false;
    }
    else if (lowerMessage.includes('forbidden') || lowerMessage.includes('403')) {
      category = 'auth';
      httpStatus = 403;
      retryable = false;
    }
    // Server errors
    else if (
      lowerMessage.includes('500') ||
      lowerMessage.includes('502') ||
      lowerMessage.includes('503') ||
      lowerMessage.includes('504') ||
      lowerMessage.includes('internal server') ||
      lowerMessage.includes('bad gateway') ||
      lowerMessage.includes('service unavailable')
    ) {
      category = 'server';
      httpStatus = 500;
      retryable = true;
    }
    // Validation errors
    else if (
      lowerMessage.includes('validation') ||
      lowerMessage.includes('invalid') ||
      lowerMessage.includes('400') ||
      lowerMessage.includes('422') ||
      lowerMessage.includes('bad request')
    ) {
      category = 'validation';
      httpStatus = 400;
      retryable = false;
    }
  } else if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object') {
    // Handle Supabase error objects
    const errorObj = error as Record<string, unknown>;

    if ('message' in errorObj && typeof errorObj.message === 'string') {
      message = errorObj.message;
    }

    if ('code' in errorObj) {
      const code = String(errorObj.code);
      if (code === 'PGRST301' || code === '42501') {
        category = 'auth';
        httpStatus = 401;
        shouldLogout = true;
      } else if (code.startsWith('23')) {
        // PostgreSQL constraint violations
        category = 'validation';
        httpStatus = 400;
      }
    }

    if ('status' in errorObj && typeof errorObj.status === 'number') {
      httpStatus = errorObj.status;
      if (httpStatus === 401) {
        category = 'auth';
        shouldLogout = true;
      } else if (httpStatus === 403) {
        category = 'auth';
      } else if (httpStatus >= 500) {
        category = 'server';
        retryable = true;
      } else if (httpStatus >= 400) {
        category = 'validation';
      }
    }
  }

  return {
    type: category,
    category,
    code: httpStatus?.toString(),
    message,
    userMessage: USER_MESSAGES[category],
    retryable,
    httpStatus,
    shouldLogout,
    originalError: error,
  };
}

/**
 * Handle service error and return standardized response
 */
export function handleServiceError<T = unknown>(
  error: unknown,
  context: string,
  options: {
    defaultMessage?: string;
    logError?: boolean;
  } = {}
): ServiceResponse<T> {
  const categorized = categorizeError(error);

  if (options.logError !== false) {
    logger.error(`[${context}] Service error:`, {
      category: categorized.category,
      message: categorized.message,
      httpStatus: categorized.httpStatus,
      retryable: categorized.retryable,
    });
  }

  return {
    success: false,
    message: options.defaultMessage || categorized.userMessage,
    error: categorized.message,
    errorCode: categorized.code,
  };
}

/**
 * Handle service error and return standardized list response
 */
export function handleServiceListError<TItem, TAggregations = Record<string, unknown>>(
  error: unknown,
  context: string,
  options: {
    defaultMessage?: string;
    logError?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): ServiceListResponse<TItem, TAggregations> {
  const categorized = categorizeError(error);

  if (options.logError !== false) {
    logger.error(`[${context}] Service list error:`, {
      category: categorized.category,
      message: categorized.message,
      httpStatus: categorized.httpStatus,
      retryable: categorized.retryable,
    });
  }

  return createEmptyListResponse<TItem, TAggregations>(
    options.defaultMessage || categorized.userMessage,
    { limit: options.limit, offset: options.offset }
  );
}

/**
 * Check if error indicates need for re-authentication
 */
export function isAuthError(error: unknown): boolean {
  const categorized = categorizeError(error);
  return categorized.category === 'auth' && categorized.shouldLogout === true;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const categorized = categorizeError(error);
  return categorized.retryable;
}

/**
 * Get user-friendly message for error
 */
export function getUserMessage(error: unknown): string {
  const categorized = categorizeError(error);
  return categorized.userMessage;
}

/**
 * Check if error is a JWT signature error (JWSInvalidSignature)
 * This happens when Supabase JWT secret changes and stored tokens become invalid
 */
export function isJWTSignatureError(error: unknown): boolean {
  if (!error) return false;

  // Helper to check if message indicates auth error
  const isAuthErrorMessage = (msg: string): boolean => {
    const lower = msg.toLowerCase();
    return (
      lower.includes('jwsinvalidsignature') ||
      lower.includes('jws') ||
      lower.includes('invalid signature') ||
      lower.includes('invalid authentication') ||
      lower.includes('authentication credentials')
    );
  };

  // Check error message
  if (error instanceof Error) {
    if (isAuthErrorMessage(error.message)) {
      return true;
    }
  }

  // Check Supabase error object
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;

    // Check message field
    if (typeof errorObj.message === 'string') {
      if (isAuthErrorMessage(errorObj.message)) {
        return true;
      }
    }

    // Check code field (PGRST301 with JWS error)
    if (errorObj.code === 'PGRST301') {
      const msg = String(errorObj.message || '').toLowerCase();
      if (msg.includes('jws')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Wrap async service call with error handling
 */
export async function withServiceErrorHandling<T>(
  operation: () => Promise<T>,
  context: string,
  options: {
    defaultMessage?: string;
    logError?: boolean;
  } = {}
): Promise<ServiceResponse<T>> {
  try {
    const result = await operation();
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return handleServiceError<T>(error, context, options);
  }
}

/**
 * M1 Fix: DRY utility for creating error response base fields
 *
 * Creates the common error response fields that can be spread into
 * domain-specific response structures. This reduces the duplicated pattern:
 *   { success: false, message: '...', error: error instanceof Error ? error.message : 'Unknown error' }
 *
 * @example
 * // Simple response
 * return createErrorResponse(error, 'Failed to create item');
 *
 * // Complex response with additional data
 * return {
 *   ...createErrorResponse(error, 'Failed to fetch dispatch list'),
 *   data: { dispatches: [], pagination: {...}, aggregations: {...} }
 * };
 */
export function createErrorResponse(
  error: unknown,
  defaultMessage: string,
  context?: string
): { success: false; message: string; error: string } {
  const categorized = categorizeError(error);

  // Log error if context provided
  if (context) {
    logger.error(`[${context}] Error:`, {
      category: categorized.category,
      message: categorized.message,
    });
  }

  // Global auth error handling - auto logout on auth failures
  handleGlobalAuthError(error);

  return {
    success: false,
    message: defaultMessage,
    error: categorized.message,
  };
}

/**
 * M3 Fix: Generic RPC execution wrapper
 *
 * Reduces the duplicated RPC try-catch-log pattern found 100+ times across services:
 * ```typescript
 * try {
 *   const client = await getAuthenticatedClient();
 *   const { data, error } = await client.rpc('...', params);
 *   if (error) { return { success: false, ... }; }
 *   if (!data?.success) { return { success: false, ... }; }
 *   return { success: true, data: data.data };
 * } catch (error) { return { success: false, ... }; }
 * ```
 *
 * @example
 * // Basic usage
 * const result = await executeRPC<CustomerData>(
 *   'get_customer',
 *   { p_customer_id: customerId },
 *   { context: 'CustomerService.getCustomer' }
 * );
 *
 * // With custom error message
 * const result = await executeRPC<OrderData>(
 *   'get_order',
 *   params,
 *   { context: 'OrderService.getOrder', errorMessage: 'Failed to fetch order' }
 * );
 *
 * // With response transformation
 * const result = await executeRPC<RawData, TransformedData>(
 *   'get_items',
 *   params,
 *   {
 *     context: 'ItemService.getItems',
 *     transform: (data) => data.items.map(mapItem)
 *   }
 * );
 */

// Import is at module level, but we need to use dynamic import to avoid circular dependency
// getAuthenticatedClient is imported in the files that use this utility

export interface ExecuteRPCOptions<TRaw, TResult = TRaw> {
  /** Context for logging (e.g., 'OrderService.getOrder') */
  context: string;
  /** Custom error message for failures */
  errorMessage?: string;
  /** Optional transform function for the response data */
  transform?: (data: TRaw) => TResult;
  /** Whether to unwrap nested data.data structures (default: true) */
  unwrapNested?: boolean;
  /** Whether to validate that response has success: true (default: true for wrapped responses) */
  validateSuccess?: boolean;
  /** Whether to log RPC call timing (default: false) */
  logTiming?: boolean;
}

export interface RPCResult<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  errorCode?: string;
}

/**
 * Execute an RPC call with standardized error handling
 *
 * @param getClient - Function to get the authenticated Supabase client
 * @param rpcName - Name of the RPC function to call
 * @param params - Parameters to pass to the RPC
 * @param options - Configuration options
 * @returns Standardized response with success/error handling
 */
export async function executeRPC<TRaw, TResult = TRaw>(
  getClient: () => Promise<any>,
  rpcName: string,
  params: Record<string, unknown> | undefined,
  options: ExecuteRPCOptions<TRaw, TResult>
): Promise<RPCResult<TResult>> {
  const {
    context,
    errorMessage,
    transform,
    unwrapNested = true,
    validateSuccess = true,
    logTiming = false,
  } = options;

  const startTime = logTiming ? Date.now() : 0;

  try {
    // Get authenticated client
    const client = await getClient();

    // Make RPC call
    const { data, error } = await client.rpc(rpcName, params);

    if (logTiming) {
      const duration = Date.now() - startTime;
      logger.info(`[${context}] RPC '${rpcName}' completed in ${duration}ms`);
    }

    // Handle Supabase error
    if (error) {
      const supabaseError = error as { message?: string; code?: string; details?: string };
      logger.error(`[${context}] RPC error:`, {
        rpcName,
        message: supabaseError.message,
        code: supabaseError.code,
        details: supabaseError.details,
      });

      // Global auth error handling - auto logout on auth failures
      handleGlobalAuthError(error);

      return {
        success: false,
        message: errorMessage || supabaseError.message || `Failed to execute ${rpcName}`,
        error: supabaseError.message || 'RPC_ERROR',
        errorCode: supabaseError.code,
      };
    }

    // Handle null/undefined response
    if (data === null || data === undefined) {
      return {
        success: false,
        message: errorMessage || 'No data returned from server',
        error: 'EMPTY_RESPONSE',
      };
    }

    // Handle wrapped response with success: false
    const dataObj = data as Record<string, unknown>;
    if (validateSuccess && typeof dataObj === 'object' && 'success' in dataObj && dataObj.success === false) {
      return {
        success: false,
        message: (dataObj.message as string) || errorMessage || 'Operation failed',
        error: (dataObj.error as string) || 'API_ERROR',
      };
    }

    // Unwrap nested data if needed
    let resultData: TRaw;
    if (unwrapNested && typeof dataObj === 'object' && 'data' in dataObj) {
      resultData = dataObj.data as TRaw;
    } else {
      resultData = data as TRaw;
    }

    // Apply optional transformation
    const finalData = transform ? transform(resultData) : (resultData as unknown as TResult);

    return {
      success: true,
      message: (dataObj?.message as string) || 'Operation completed successfully',
      data: finalData,
    };
  } catch (error) {
    logger.error(`[${context}] Exception in RPC '${rpcName}':`, error);
    const categorized = categorizeError(error);

    return {
      success: false,
      message: errorMessage || categorized.userMessage,
      error: categorized.message,
      errorCode: categorized.code,
    };
  }
}
