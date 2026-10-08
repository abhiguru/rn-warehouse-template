/**
 * Input Validation Utility
 *
 * Provides validation functions for user inputs before they are sent to RPC functions.
 * Helps prevent SQL injection, XSS, and other injection attacks.
 */

import { createLogger } from './logger';

const validationLogger = createLogger('InputValidation');

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Common validation patterns
 */
const PATTERNS = {
  // UUIDs (Supabase IDs)
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,

  // Phone numbers (Indian format)
  PHONE: /^[6-9]\d{9}$/,
  PHONE_WITH_CODE: /^(91)?[6-9]\d{9}$/,

  // Email
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  // Alphanumeric with common special chars (for names, descriptions)
  SAFE_TEXT: /^[a-zA-Z0-9\s\-_.,()&]+$/,

  // Positive integers
  POSITIVE_INT: /^\d+$/,

  // Positive decimal numbers
  POSITIVE_DECIMAL: /^\d+(\.\d+)?$/,

  // Date in ISO format
  ISO_DATE: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/,
};

/**
 * Sanitize string input by removing potentially dangerous characters
 */
export const sanitizeString = (input: string): string => {
  if (typeof input !== 'string') {
    throw new ValidationError('Input must be a string');
  }

  // Remove null bytes, control characters
  let sanitized = input.replace(/\0/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
};

/**
 * Validate UUID format
 */
export const validateUUID = (id: unknown, fieldName: string = 'ID'): string => {
  if (typeof id !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, fieldName);
  }

  const sanitized = sanitizeString(id);

  if (!PATTERNS.UUID.test(sanitized)) {
    validationLogger.warn(`Invalid UUID format for ${fieldName}: ${sanitized.substring(0, 8)}...`);
    throw new ValidationError(`${fieldName} must be a valid UUID`, fieldName);
  }

  return sanitized;
};

/**
 * Validate phone number (Indian format)
 */
export const validatePhone = (phone: unknown, fieldName: string = 'Phone'): string => {
  if (typeof phone !== 'string' && typeof phone !== 'number') {
    throw new ValidationError(`${fieldName} must be a string or number`, fieldName);
  }

  const sanitized = sanitizeString(String(phone));

  // Remove country code if present
  const phoneNumber = sanitized.replace(/^91/, '');

  if (!PATTERNS.PHONE.test(phoneNumber)) {
    validationLogger.warn(`Invalid phone format for ${fieldName}`);
    throw new ValidationError(`${fieldName} must be a valid 10-digit Indian phone number`, fieldName);
  }

  return phoneNumber;
};

/**
 * Validate email address
 */
export const validateEmail = (email: unknown, fieldName: string = 'Email'): string => {
  if (typeof email !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, fieldName);
  }

  const sanitized = sanitizeString(email).toLowerCase();

  if (!PATTERNS.EMAIL.test(sanitized)) {
    validationLogger.warn(`Invalid email format for ${fieldName}`);
    throw new ValidationError(`${fieldName} must be a valid email address`, fieldName);
  }

  return sanitized;
};

/**
 * Validate positive integer
 */
export const validatePositiveInt = (
  value: unknown,
  fieldName: string = 'Value',
  options: { min?: number; max?: number } = {}
): number => {
  const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);

  if (isNaN(num) || !Number.isInteger(num) || num < 0) {
    throw new ValidationError(`${fieldName} must be a positive integer`, fieldName);
  }

  if (options.min !== undefined && num < options.min) {
    throw new ValidationError(`${fieldName} must be at least ${options.min}`, fieldName);
  }

  if (options.max !== undefined && num > options.max) {
    throw new ValidationError(`${fieldName} must be at most ${options.max}`, fieldName);
  }

  return num;
};

/**
 * Validate positive decimal number
 */
export const validatePositiveDecimal = (
  value: unknown,
  fieldName: string = 'Value',
  options: { min?: number; max?: number; maxDecimals?: number } = {}
): number => {
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);

  if (isNaN(num) || num < 0) {
    throw new ValidationError(`${fieldName} must be a positive number`, fieldName);
  }

  if (options.min !== undefined && num < options.min) {
    throw new ValidationError(`${fieldName} must be at least ${options.min}`, fieldName);
  }

  if (options.max !== undefined && num > options.max) {
    throw new ValidationError(`${fieldName} must be at most ${options.max}`, fieldName);
  }

  if (options.maxDecimals !== undefined) {
    const decimals = (num.toString().split('.')[1] || '').length;
    if (decimals > options.maxDecimals) {
      throw new ValidationError(
        `${fieldName} must have at most ${options.maxDecimals} decimal places`,
        fieldName
      );
    }
  }

  return num;
};

/**
 * Validate date string (ISO format)
 */
export const validateDate = (date: unknown, fieldName: string = 'Date'): string => {
  if (typeof date !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, fieldName);
  }

  const sanitized = sanitizeString(date);

  if (!PATTERNS.ISO_DATE.test(sanitized)) {
    throw new ValidationError(`${fieldName} must be a valid ISO date string`, fieldName);
  }

  // Verify it's a valid date
  const dateObj = new Date(sanitized);
  if (isNaN(dateObj.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`, fieldName);
  }

  return sanitized;
};

/**
 * Validate safe text (names, descriptions, etc.)
 */
export const validateSafeText = (
  text: unknown,
  fieldName: string = 'Text',
  options: { minLength?: number; maxLength?: number; required?: boolean } = {}
): string => {
  if (typeof text !== 'string') {
    if (options.required) {
      throw new ValidationError(`${fieldName} is required`, fieldName);
    }
    return '';
  }

  const sanitized = sanitizeString(text);

  if (options.required && sanitized.length === 0) {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }

  if (options.minLength !== undefined && sanitized.length < options.minLength) {
    throw new ValidationError(
      `${fieldName} must be at least ${options.minLength} characters`,
      fieldName
    );
  }

  if (options.maxLength !== undefined && sanitized.length > options.maxLength) {
    throw new ValidationError(
      `${fieldName} must be at most ${options.maxLength} characters`,
      fieldName
    );
  }

  // Check for potentially dangerous patterns
  if (sanitized && !PATTERNS.SAFE_TEXT.test(sanitized)) {
    validationLogger.warn(`Unsafe characters detected in ${fieldName}`);
    throw new ValidationError(
      `${fieldName} contains invalid characters. Only letters, numbers, spaces, and basic punctuation are allowed.`,
      fieldName
    );
  }

  return sanitized;
};

/**
 * Validate pagination parameters
 */
export const validatePagination = (params: {
  limit?: unknown;
  offset?: unknown;
}): { limit: number; offset: number } => {
  const limit = params.limit !== undefined
    ? validatePositiveInt(params.limit, 'Limit', { min: 1, max: 1000 })
    : 50; // Default limit

  const offset = params.offset !== undefined
    ? validatePositiveInt(params.offset, 'Offset', { min: 0 })
    : 0; // Default offset

  return { limit, offset };
};

/**
 * Validate array of UUIDs
 */
export const validateUUIDArray = (
  ids: unknown,
  fieldName: string = 'IDs',
  options: { minLength?: number; maxLength?: number } = {}
): string[] => {
  if (!Array.isArray(ids)) {
    throw new ValidationError(`${fieldName} must be an array`, fieldName);
  }

  if (options.minLength !== undefined && ids.length < options.minLength) {
    throw new ValidationError(
      `${fieldName} must contain at least ${options.minLength} items`,
      fieldName
    );
  }

  if (options.maxLength !== undefined && ids.length > options.maxLength) {
    throw new ValidationError(
      `${fieldName} must contain at most ${options.maxLength} items`,
      fieldName
    );
  }

  return ids.map((id, index) => validateUUID(id, `${fieldName}[${index}]`));
};

/**
 * Batch validation helper
 * Validates multiple fields and collects all errors
 */
export const validateFields = (
  validations: Array<() => void>
): { isValid: boolean; errors: ValidationError[] } => {
  const errors: ValidationError[] = [];

  for (const validation of validations) {
    try {
      validation();
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error);
      } else {
        errors.push(new ValidationError('Unexpected validation error'));
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
