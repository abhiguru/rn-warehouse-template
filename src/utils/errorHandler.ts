/**
 * Standardized Error Handler Utility
 *
 * Provides consistent error handling across all services with proper typing,
 * logging, and user-friendly error messages.
 */

import { createLogger } from './logger';
import { ValidationError } from './inputValidation';
import { getAppErrorCode } from './appError';
import { getLanguage, localizeDigits, t, type TranslationKey } from '@/i18n';
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
 * User-friendly error messages mapped to error codes: the keys of the texts,
 * read with `t` when a message is needed (never at module load).
 */
const ERROR_MESSAGE_KEYS: Record<ErrorCode, TranslationKey> = {
  [ErrorCode.NETWORK_ERROR]: 'errors.code.networkError',
  [ErrorCode.TIMEOUT]: 'errors.code.timeout',
  [ErrorCode.UNAUTHORIZED]: 'errors.code.unauthorized',
  [ErrorCode.FORBIDDEN]: 'errors.code.forbidden',
  [ErrorCode.SESSION_EXPIRED]: 'errors.code.sessionExpired',
  [ErrorCode.VALIDATION_ERROR]: 'errors.code.validationError',
  [ErrorCode.INVALID_INPUT]: 'errors.code.invalidInput',
  [ErrorCode.DATABASE_ERROR]: 'errors.code.databaseError',
  [ErrorCode.NOT_FOUND]: 'errors.code.notFound',
  [ErrorCode.DUPLICATE_ENTRY]: 'errors.code.duplicateEntry',
  [ErrorCode.BUSINESS_RULE_VIOLATION]: 'errors.code.businessRuleViolation',
  [ErrorCode.INSUFFICIENT_STOCK]: 'errors.code.insufficientStock',
  [ErrorCode.UNKNOWN_ERROR]: 'errors.general.unexpectedRetry',
};

/** The message shown to a person for an error code, in the app's language. */
export function getErrorCodeMessage(errorCode: ErrorCode): string {
  return t(ERROR_MESSAGE_KEYS[errorCode]);
}

/**
 * Detect error code from error object
 */
function detectErrorCode(error: unknown): ErrorCode {
  if (error instanceof ValidationError) {
    return ErrorCode.VALIDATION_ERROR;
  }

  // Errors the app raised carry a code; their text is translated and is never matched.
  const appCode = getAppErrorCode(error);
  if (appCode === 'NETWORK') return ErrorCode.NETWORK_ERROR;
  if (appCode === 'TIMEOUT') return ErrorCode.TIMEOUT;
  if (appCode) return ErrorCode.UNKNOWN_ERROR;

  // Everything else is server or system text, which stays English.
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

  return t('errors.general.anUnknownOccurred');
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
  const userMessage = options.defaultMessage || getErrorCodeMessage(errorCode);

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
    message: message || t('errors.general.operationCompleted'),
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
 * Maps operation context + operation to the key of a friendly message;
 * the text is read with `t` in getUserFriendlyError.
 */
const CONTEXT_ERROR_MESSAGE_KEYS: Record<string, Record<string, TranslationKey>> = {
  // GRN operations
  grn: {
    load: 'errors.friendly.grn.load',
    create: 'errors.friendly.grn.create',
    update: 'errors.friendly.grn.update',
    delete: 'errors.friendly.grn.delete',
    fetch: 'errors.friendly.grn.fetch',
  },
  // Dispatch operations
  dispatch: {
    load: 'errors.friendly.dispatch.load',
    create: 'errors.friendly.dispatch.create',
    update: 'errors.friendly.dispatch.update',
    delete: 'errors.friendly.dispatch.delete',
    fetch: 'errors.friendly.dispatch.fetch',
    generate: 'errors.friendly.dispatch.generate',
  },
  // Invoice operations
  invoice: {
    load: 'errors.friendly.invoice.load',
    create: 'errors.friendly.invoice.create',
    update: 'errors.friendly.invoice.update',
    delete: 'errors.friendly.invoice.delete',
    fetch: 'errors.friendly.invoice.fetch',
  },
  // User operations
  user: {
    load: 'errors.friendly.user.load',
    update: 'errors.friendly.user.update',
    create: 'errors.friendly.user.create',
  },
  // Image operations
  image: {
    pick: 'errors.friendly.image.pick',
    upload: 'errors.friendly.image.upload',
    capture: 'errors.friendly.image.capture',
  },
  // Stock operations
  stock: {
    load: 'errors.friendly.stock.load',
    fetch: 'errors.friendly.stock.fetch',
  },
  // Order operations
  order: {
    load: 'errors.friendly.order.load',
    fetch: 'errors.friendly.order.fetch',
    create: 'errors.friendly.order.create',
  },
  // Auth/OTP operations
  auth: {
    sendOtp: 'errors.friendly.auth.sendOtp',
    verifyOtp: 'errors.friendly.auth.verifyOtp',
    invalidOtp: 'errors.friendly.auth.invalidOtp',
    expiredOtp: 'errors.friendly.auth.expiredOtp',
    tooManyAttempts: 'errors.friendly.auth.tooManyAttempts',
    phoneInvalid: 'errors.friendly.auth.phoneInvalid',
    sessionExpired: 'errors.code.sessionExpired',
  },
  // Price operations
  price: {
    load: 'errors.friendly.price.load',
    create: 'errors.friendly.price.create',
    update: 'errors.friendly.price.update',
    notFound: 'errors.friendly.price.notFound',
  },
  // General operations
  general: {
    load: 'errors.friendly.general.load',
    save: 'errors.friendly.general.save',
    delete: 'errors.friendly.general.delete',
    network: 'errors.friendly.general.network',
    unknown: 'errors.general.somethingWrongRetry',
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
  const contextMessages = CONTEXT_ERROR_MESSAGE_KEYS[context.toLowerCase()];
  if (contextMessages && contextMessages[operation.toLowerCase()]) {
    return t(contextMessages[operation.toLowerCase()]);
  }

  // Try general context
  const generalMessages = CONTEXT_ERROR_MESSAGE_KEYS.general;
  if (generalMessages[operation.toLowerCase()]) {
    return t(generalMessages[operation.toLowerCase()]);
  }

  return fallbackMessage || t('errors.general.errorRetry');
}

const GUJARATI_SCRIPT = /[\u0A80-\u0AFF]/;

/** Document names callers pass as `context`, by their lower-cased English word. */
const CONTEXT_NAME_KEYS: Record<string, TranslationKey> = {
  grn: 'common.grn',
  dispatch: 'common.dispatch',
  invoice: 'common.invoice',
  order: 'common.order',
  customer: 'common.customer',
  item: 'common.item',
};

/** The context word in the app's language; English keeps the caller's own wording. */
function contextName(context: string): string {
  const key = CONTEXT_NAME_KEYS[context.toLowerCase()];
  return key && getLanguage() !== 'en' ? t(key) : context;
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
    return t('errors.general.unexpectedRetry');
  }

  // The keyword tests below read English text from the server. A message the app
  // wrote in Gujarati is already what the person should read: it is never
  // matched against English words, it is shown as it is.
  if (GUJARATI_SCRIPT.test(technicalError)) {
    return technicalError;
  }

  const errorLower = technicalError.toLowerCase();

  // OTP-specific errors (check these first for auth context)
  if (errorLower.includes('invalid') && errorLower.includes('otp')) {
    return t('errors.friendly.auth.invalidOtp');
  }
  if (errorLower.includes('expired') && errorLower.includes('otp')) {
    return t('errors.friendly.auth.expiredOtp');
  }
  if (errorLower.includes('invalid or expired otp')) {
    return t('errors.parsed.otpIncorrectOrExpired');
  }
  if (errorLower.includes('too many') && (errorLower.includes('otp') || errorLower.includes('attempt'))) {
    return t('errors.parsed.tooManyAttempts');
  }
  if (errorLower.includes('captcha')) {
    return t('errors.parsed.verificationRequired');
  }

  // Network errors
  if (errorLower.includes('network') || errorLower.includes('fetch') || errorLower.includes('connection')) {
    return t('errors.parsed.network');
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
      return t('errors.parsed.rateLimitSeconds', { seconds: localizeDigits(secondsMatch[1]) });
    }
    const minutesMatch = technicalError.match(/wait\s+(\d+)\s*minutes?/i);
    if (minutesMatch) {
      return t('errors.parsed.rateLimitMinutes', { minutes: localizeDigits(minutesMatch[1]) });
    }
    return t('errors.parsed.rateLimit');
  }

  // Authentication errors
  if (errorLower.includes('unauthorized') || errorLower.includes('401') || errorLower.includes('not authenticated')) {
    return t('errors.code.sessionExpired');
  }

  // Permission errors
  if (errorLower.includes('forbidden') || errorLower.includes('403') || errorLower.includes('permission')) {
    return t('errors.parsed.noPermission');
  }

  // Not found errors
  if (errorLower.includes('not found') || errorLower.includes('404')) {
    return context
      ? t('errors.parsed.contextNotFound', { context: contextName(context) })
      : t('errors.parsed.itemNotFound');
  }

  // Duplicate errors
  if (errorLower.includes('duplicate') || errorLower.includes('already exists') || errorLower.includes('unique')) {
    return t('errors.parsed.duplicate');
  }

  // Validation errors
  if (errorLower.includes('invalid') || errorLower.includes('required') || errorLower.includes('must be')) {
    return t('errors.parsed.checkInput');
  }

  // Timeout errors
  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return t('errors.category.timeout');
  }

  // Stock errors
  if (errorLower.includes('stock') || errorLower.includes('quantity') || errorLower.includes('insufficient')) {
    return t('errors.code.insufficientStock');
  }

  // Database errors (hide technical details)
  if (errorLower.includes('database') || errorLower.includes('sql') || errorLower.includes('query')) {
    return t('errors.parsed.serverError');
  }

  // If the error is already user-friendly (starts with capital, no technical jargon)
  if (/^[A-Z][a-z]/.test(technicalError) &&
      !errorLower.includes('error:') &&
      !errorLower.includes('exception') &&
      technicalError.length < 100) {
    return technicalError;
  }

  // Default fallback
  return t('errors.general.somethingWrongRetry');
}
