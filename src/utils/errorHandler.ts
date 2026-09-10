/**
 * Standardized Error Handler Utility
 *
 * Provides consistent error handling across all services with proper typing,
 * logging, and user-friendly error messages.
 */

import { createLogger } from './logger';
import { ValidationError } from './inputValidation';
// Re-export ServiceResponse from canonical source for backward compatibility
// @see J6 - DRY Violation: ServiceResponse Type Defined 8+ Times
import { ServiceResponse } from '../types/service.types';
export type { ServiceResponse };

const errorLogger = createLogger('ErrorHandler');

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Standard error codes
 */
export enum ErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Authentication errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  SESSION_EXPIRED = 'SESSION_EXPIRED',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',

  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',

  // Business logic errors
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',

  // Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * User-friendly error messages mapped to error codes
 */
const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.NETWORK_ERROR]: 'Network connection failed. Please check your internet connection.',
  [ErrorCode.TIMEOUT]: 'Request timed out. Please try again.',
  [ErrorCode.UNAUTHORIZED]: 'You are not authorized to perform this action. Please sign in.',
  [ErrorCode.FORBIDDEN]: 'You do not have permission to access this resource.',
  [ErrorCode.SESSION_EXPIRED]: 'Your session has expired. Please sign in again.',
  [ErrorCode.VALIDATION_ERROR]: 'The information provided is invalid. Please check and try again.',
  [ErrorCode.INVALID_INPUT]: 'Invalid input provided. Please check your data.',
  [ErrorCode.DATABASE_ERROR]: 'A database error occurred. Please try again later.',
  [ErrorCode.NOT_FOUND]: 'The requested resource was not found.',
  [ErrorCode.DUPLICATE_ENTRY]: 'This entry already exists.',
  [ErrorCode.BUSINESS_RULE_VIOLATION]: 'This operation violates a business rule.',
  [ErrorCode.INSUFFICIENT_STOCK]: 'Insufficient stock available for this operation.',
  [ErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
};

/**
 * Detect error code from error object
 */
function detectErrorCode(error: unknown): ErrorCode {
  if (error instanceof ValidationError) {
    return ErrorCode.VALIDATION_ERROR;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch failed')) {
      return ErrorCode.NETWORK_ERROR;
    }
    if (message.includes('timeout')) {
      return ErrorCode.TIMEOUT;
    }
    if (message.includes('unauthorized') || message.includes('401')) {
      return ErrorCode.UNAUTHORIZED;
    }
    if (message.includes('forbidden') || message.includes('403')) {
      return ErrorCode.FORBIDDEN;
    }
    if (message.includes('not found') || message.includes('404')) {
      return ErrorCode.NOT_FOUND;
    }
    if (message.includes('duplicate') || message.includes('already exists')) {
      return ErrorCode.DUPLICATE_ENTRY;
    }
    if (message.includes('session') && message.includes('expired')) {
      return ErrorCode.SESSION_EXPIRED;
    }
    if (message.includes('stock')) {
      return ErrorCode.INSUFFICIENT_STOCK;
    }
  }

  return ErrorCode.UNKNOWN_ERROR;
}

/**
 * Get error severity based on error code
 */
function getErrorSeverity(errorCode: ErrorCode): ErrorSeverity {
  switch (errorCode) {
    case ErrorCode.NETWORK_ERROR:
    case ErrorCode.TIMEOUT:
      return ErrorSeverity.MEDIUM;

    case ErrorCode.UNAUTHORIZED:
    case ErrorCode.FORBIDDEN:
    case ErrorCode.SESSION_EXPIRED:
      return ErrorSeverity.HIGH;

    case ErrorCode.DATABASE_ERROR:
      return ErrorSeverity.CRITICAL;

    case ErrorCode.VALIDATION_ERROR:
    case ErrorCode.INVALID_INPUT:
    case ErrorCode.NOT_FOUND:
    case ErrorCode.DUPLICATE_ENTRY:
    case ErrorCode.BUSINESS_RULE_VIOLATION:
    case ErrorCode.INSUFFICIENT_STOCK:
      return ErrorSeverity.LOW;

    default:
      return ErrorSeverity.MEDIUM;
  }
}

/**
 * Extract error message from error object
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof ValidationError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }

  return 'An unknown error occurred';
}

/**
 * Handle error and return standardized response
 */
export function handleError<T = unknown>(
  error: unknown,
  context: string,
  options: {
    defaultMessage?: string;
    includeStack?: boolean;
    severity?: ErrorSeverity;
  } = {}
): ServiceResponse<T> {
  const errorCode = detectErrorCode(error);
  const severity = options.severity || getErrorSeverity(errorCode);
  const technicalMessage = extractErrorMessage(error);
  const userMessage = options.defaultMessage || ERROR_MESSAGES[errorCode];

  // Log error with appropriate severity
  const logData = {
    context,
    errorCode,
    severity,
    technicalMessage,
    stack: options.includeStack && error instanceof Error ? error.stack : undefined,
  };

  switch (severity) {
    case ErrorSeverity.CRITICAL:
      errorLogger.error(`[${context}] Critical error:`, logData);
      break;
    case ErrorSeverity.HIGH:
      errorLogger.error(`[${context}] High severity error:`, logData);
      break;
    case ErrorSeverity.MEDIUM:
      errorLogger.warn(`[${context}] Medium severity error:`, logData);
      break;
    case ErrorSeverity.LOW:
      errorLogger.info(`[${context}] Low severity error:`, logData);
      break;
  }

  return {
    success: false,
    message: userMessage,
    error: technicalMessage,
    errorCode,
  };
}

/**
 * Handle success response
 */
export function handleSuccess<T>(
  data: T,
  message?: string
): ServiceResponse<T> {
  return {
    success: true,
    data,
    message: message || 'Operation completed successfully',
  };
}

/**
 * Wrap async service calls with standardized error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string,
  options: {
    defaultMessage?: string;
    includeStack?: boolean;
    onError?: (error: unknown) => void;
  } = {}
): Promise<ServiceResponse<T>> {
  try {
    const result = await operation();
    return handleSuccess(result);
  } catch (error: unknown) {
    if (options.onError) {
      options.onError(error);
    }
    return handleError<T>(error, context, options);
  }
}

/**
 * Check if a response is an error response
 */
export function isErrorResponse<T>(
  response: ServiceResponse<T>
): response is ServiceResponse<T> & { success: false; error: string } {
  return !response.success;
}

/**
 * Check if error is a specific error code
 */
export function isErrorCode(
  response: ServiceResponse<unknown>,
  code: ErrorCode
): boolean {
  return isErrorResponse(response) && response.errorCode === code;
}

/**
 * User-friendly error messages for specific operation contexts
 * Maps operation context + error patterns to friendly messages
 */
const CONTEXT_ERROR_MESSAGES: Record<string, Record<string, string>> = {
  // GRN operations
  grn: {
    load: 'Unable to load GRN details. Please try again.',
    create: 'Unable to create GRN. Please check your data and try again.',
    update: 'Unable to update GRN. Please try again.',
    delete: 'Unable to delete GRN. Please try again.',
    fetch: 'Unable to fetch GRN list. Please check your connection.',
  },
  // Dispatch operations
  dispatch: {
    load: 'Unable to load dispatch details. Please try again.',
    create: 'Unable to create dispatch. Please check your data and try again.',
    update: 'Unable to update dispatch. Please try again.',
    delete: 'Unable to delete dispatch. Please try again.',
    fetch: 'Unable to fetch dispatch list. Please check your connection.',
    generate: 'Unable to generate dispatch number. Please try again.',
  },
  // Invoice operations
  invoice: {
    load: 'Unable to load invoice details. Please try again.',
    create: 'Unable to create invoice. Please check your data and try again.',
    update: 'Unable to update invoice. Please try again.',
    delete: 'Unable to delete invoice. Please try again.',
    fetch: 'Unable to fetch invoice list. Please check your connection.',
  },
  // User operations
  user: {
    load: 'Unable to load user data. Please try again.',
    update: 'Unable to update user. Please try again.',
    create: 'Unable to create user. Please try again.',
  },
  // Image operations
  image: {
    pick: 'Unable to select images. Please try again.',
    upload: 'Unable to upload image. Please check your connection.',
    capture: 'Unable to take photo. Please check camera permissions.',
  },
  // Stock operations
  stock: {
    load: 'Unable to load stock data. Please try again.',
    fetch: 'Unable to fetch stock information. Please try again.',
  },
  // Order operations
  order: {
    load: 'Unable to load order details. Please try again.',
    fetch: 'Unable to fetch orders. Please check your connection.',
    create: 'Unable to create order. Please try again.',
  },
  // Auth/OTP operations
  auth: {
    sendOtp: 'Unable to send verification code. Please try again.',
    verifyOtp: 'Unable to verify code. Please try again.',
    invalidOtp: 'The code you entered is incorrect. Please check and try again.',
    expiredOtp: 'This code has expired. Please request a new one.',
    tooManyAttempts: 'Too many attempts. Please wait a few minutes and try again.',
    phoneInvalid: 'Please enter a valid phone number.',
    sessionExpired: 'Your session has expired. Please sign in again.',
  },
  // Price operations
  price: {
    load: 'Unable to load price data. Please try again.',
    create: 'Unable to create price entry. Please try again.',
    update: 'Unable to update price. Please try again.',
    notFound: 'Price entry not found.',
  },
  // General operations
  general: {
    load: 'Unable to load data. Please try again.',
    save: 'Unable to save changes. Please try again.',
    delete: 'Unable to delete. Please try again.',
    network: 'Network error. Please check your connection.',
    unknown: 'Something went wrong. Please try again.',
  },
};

/**
 * Get a user-friendly error message for a specific context and operation
 *
 * @param context - The feature context (grn, dispatch, invoice, etc.)
 * @param operation - The operation type (load, create, update, delete, etc.)
 * @param fallbackMessage - Optional fallback if no mapping exists
 * @returns User-friendly error message
 *
 * @example
 * getUserFriendlyError('grn', 'load') // "Unable to load GRN details. Please try again."
 * getUserFriendlyError('dispatch', 'create') // "Unable to create dispatch. Please check your data and try again."
 */
export function getUserFriendlyError(
  context: string,
  operation: string,
  fallbackMessage?: string
): string {
  const contextMessages = CONTEXT_ERROR_MESSAGES[context.toLowerCase()];
  if (contextMessages && contextMessages[operation.toLowerCase()]) {
    return contextMessages[operation.toLowerCase()];
  }

  // Try general context
  const generalMessages = CONTEXT_ERROR_MESSAGES.general;
  if (generalMessages[operation.toLowerCase()]) {
    return generalMessages[operation.toLowerCase()];
  }

  return fallbackMessage || 'An error occurred. Please try again.';
}

/**
 * Parse a technical error message and return a user-friendly version
 *
 * @param technicalError - The raw error message from services
 * @param context - Optional context for more specific messages
 * @returns User-friendly error message
 */
export function parseErrorToFriendly(
  technicalError: string | undefined | null,
  context?: string
): string {
  if (!technicalError) {
    return 'An unexpected error occurred. Please try again.';
  }

  const errorLower = technicalError.toLowerCase();

  // OTP-specific errors (check these first for auth context)
  if (errorLower.includes('invalid') && errorLower.includes('otp')) {
    return 'The code you entered is incorrect. Please check and try again.';
  }
  if (errorLower.includes('expired') && errorLower.includes('otp')) {
    return 'This code has expired. Please request a new one.';
  }
  if (errorLower.includes('invalid or expired otp')) {
    return 'The code is incorrect or has expired. Please try again or request a new code.';
  }
  if (errorLower.includes('too many') && (errorLower.includes('otp') || errorLower.includes('attempt'))) {
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }
  if (errorLower.includes('captcha')) {
    return 'Verification required. Please try again.';
  }

  // Network errors
  if (errorLower.includes('network') || errorLower.includes('fetch') || errorLower.includes('connection')) {
    return 'Network connection issue. Please check your internet and try again.';
  }

  // I18: Rate limit / Too many requests (429) errors
  if (
    errorLower.includes('429') ||
    errorLower.includes('rate limit') ||
    errorLower.includes('throttl') ||
    (errorLower.includes('too many') && errorLower.includes('request'))
  ) {
    // Extract wait time if present
    const secondsMatch = technicalError.match(/wait\s+(\d+)\s*seconds?/i);
    if (secondsMatch) {
      return `Too many requests. Please wait ${secondsMatch[1]} seconds before trying again.`;
    }
    const minutesMatch = technicalError.match(/wait\s+(\d+)\s*minutes?/i);
    if (minutesMatch) {
      return `Too many requests. Please wait ${minutesMatch[1]} minutes before trying again.`;
    }
    return 'Too many requests. Please wait before trying again.';
  }

  // Authentication errors
  if (errorLower.includes('unauthorized') || errorLower.includes('401') || errorLower.includes('not authenticated')) {
    return 'Your session has expired. Please sign in again.';
  }

  // Permission errors
  if (errorLower.includes('forbidden') || errorLower.includes('403') || errorLower.includes('permission')) {
    return 'You do not have permission to perform this action.';
  }

  // Not found errors
  if (errorLower.includes('not found') || errorLower.includes('404')) {
    return context
      ? `${context} not found. It may have been deleted.`
      : 'The requested item was not found.';
  }

  // Duplicate errors
  if (errorLower.includes('duplicate') || errorLower.includes('already exists') || errorLower.includes('unique')) {
    return 'This entry already exists. Please use a different value.';
  }

  // Validation errors
  if (errorLower.includes('invalid') || errorLower.includes('required') || errorLower.includes('must be')) {
    return 'Please check your input and try again.';
  }

  // Timeout errors
  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return 'The request took too long. Please try again.';
  }

  // Stock errors
  if (errorLower.includes('stock') || errorLower.includes('quantity') || errorLower.includes('insufficient')) {
    return 'Insufficient stock available for this operation.';
  }

  // Database errors (hide technical details)
  if (errorLower.includes('database') || errorLower.includes('sql') || errorLower.includes('query')) {
    return 'A server error occurred. Please try again later.';
  }

  // If the error is already user-friendly (starts with capital, no technical jargon)
  if (/^[A-Z][a-z]/.test(technicalError) &&
      !errorLower.includes('error:') &&
      !errorLower.includes('exception') &&
      technicalError.length < 100) {
    return technicalError;
  }

  // Default fallback
  return 'Something went wrong. Please try again.';
}
