/**
 * Shared Yup Validation Helpers
 *
 * J16 Fix: Common validation patterns extracted for DRY compliance.
 * Used by grnValidation.ts, dispatchValidation.ts, invoiceValidation.ts
 */

import * as yup from 'yup';

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// ============================================================================
// COMMON FIELD VALIDATORS
// ============================================================================

/**
 * UUID validator with custom error message
 */
export const uuidField = (fieldName: string) =>
  yup.string().uuid(`Invalid ${fieldName} selection`);

/**
 * Required UUID validator
 */
export const requiredUuidField = (fieldName: string) =>
  uuidField(fieldName).required(`${fieldName} is required`);

/**
 * Required string with max length
 */
export const requiredStringField = (fieldName: string, maxLength: number) =>
  yup
    .string()
    .required(`${fieldName} is required`)
    .max(maxLength, `${fieldName} must be at most ${maxLength} characters`);

/**
 * Optional string with max length
 */
export const optionalStringField = (maxLength: number, fieldName?: string) =>
  yup
    .string()
    .max(maxLength, `${fieldName || 'Field'} must be at most ${maxLength} characters`);

/**
 * Date field that cannot be in the future
 */
export const pastDateField = (fieldName: string = 'Date') =>
  yup
    .date()
    .required(`${fieldName} is required`)
    .max(new Date(), 'Cannot select a future date');

/**
 * Date string field that cannot be in the future
 */
export const pastDateStringField = (fieldName: string = 'Date') =>
  yup
    .string()
    .required(`${fieldName} is required`)
    .test('valid-date', 'Invalid date format', (value) => {
      if (!value) return false;
      const date = new Date(value);
      return !isNaN(date.getTime());
    })
    .test('not-future', 'Cannot select a future date', (value) => {
      if (!value) return true;
      const date = new Date(value);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return date <= today;
    });

/**
 * Positive integer quantity field
 */
export const quantityField = (fieldName: string = 'Quantity', minValue: number = 1) =>
  yup
    .number()
    .required(`${fieldName} is required`)
    .positive(`${fieldName} must be positive`)
    .integer(`${fieldName} must be a whole number`)
    .min(minValue, `${fieldName} must be at least ${minValue}`);

/**
 * Non-negative integer field (for stock, counts)
 */
export const nonNegativeIntegerField = (fieldName: string = 'Value') =>
  yup
    .number()
    .required(`${fieldName} is required`)
    .integer(`${fieldName} must be a whole number`)
    .min(0, `${fieldName} cannot be negative`);

/**
 * Monetary amount field (non-negative with max)
 */
export const moneyField = (fieldName: string = 'Amount', maxValue: number = 999999.99) =>
  yup
    .number()
    .min(0, `${fieldName} cannot be negative`)
    .max(maxValue, `${fieldName} is too large`);

/**
 * Required monetary amount field
 */
export const requiredMoneyField = (fieldName: string = 'Amount', maxValue: number = 999999.99) =>
  moneyField(fieldName, maxValue).required(`${fieldName} is required`);

/**
 * Percentage field (0-100)
 */
export const percentageField = (fieldName: string = 'Percentage') =>
  yup
    .number()
    .required(`${fieldName} is required`)
    .min(0, `${fieldName} cannot be negative`)
    .max(100, `${fieldName} cannot exceed 100%`);

/**
 * Image URL field (http/https/file URI)
 */
export const imageUrlField = () =>
  yup.string().test('valid-uri', 'Invalid image URL', (value) => {
    if (!value) return true;
    return /^(https?:\/\/|file:\/\/\/)/.test(value);
  });

/**
 * Array of image URLs with max count
 */
export const imageUrlArrayField = (maxCount: number = 10) =>
  yup
    .array()
    .of(imageUrlField())
    .max(maxCount, `Maximum ${maxCount} images allowed`);

/**
 * Items array with minimum count
 */
export const itemsArrayField = <T extends yup.AnyObject>(
  itemSchema: yup.ObjectSchema<T>,
  minCount: number = 1
) =>
  yup
    .array()
    .of(itemSchema)
    .min(minCount, `At least ${minCount === 1 ? 'one item is' : `${minCount} items are`} required`)
    .required('Items are required');

// ============================================================================
// VALIDATION HELPER FACTORY
// ============================================================================

/**
 * Create a step validator function from a Yup schema.
 * Eliminates the repetitive try/catch pattern across validation files.
 *
 * @param schema - Yup schema to validate against
 * @returns Async function that validates data and returns ValidationResult
 *
 * @example
 * export const validateStep1 = createStepValidator(step1Schema);
 */
export function createStepValidator<T extends yup.AnyObject>(
  schema: yup.ObjectSchema<T>
): (data: unknown) => Promise<ValidationResult> {
  return async (data: unknown): Promise<ValidationResult> => {
    try {
      await schema.validate(data, { abortEarly: false });
      return { isValid: true, errors: {} };
    } catch (error) {
      if (error instanceof yup.ValidationError) {
        const errors: Record<string, string> = {};
        error.inner.forEach((err) => {
          if (err.path) {
            errors[err.path] = err.message;
          }
        });
        return { isValid: false, errors };
      }
      return { isValid: false, errors: { _error: 'Validation failed' } };
    }
  };
}

/**
 * Create a step validator with logging (for debugging)
 */
export function createStepValidatorWithLogging<T extends yup.AnyObject>(
  schema: yup.ObjectSchema<T>,
  stepName: string
): (data: unknown) => Promise<ValidationResult> {
  return async (data: unknown): Promise<ValidationResult> => {
    if (__DEV__) {
      console.log(`[${stepName}] Validating:`, data);
    }

    try {
      await schema.validate(data, { abortEarly: false });
      if (__DEV__) {
        console.log(`[${stepName}] Validation PASSED`);
      }
      return { isValid: true, errors: {} };
    } catch (error) {
      if (__DEV__) {
        console.log(`[${stepName}] Validation FAILED`);
      }

      if (error instanceof yup.ValidationError) {
        const errors: Record<string, string> = {};
        error.inner.forEach((err, index) => {
          if (__DEV__) {
            console.log(`[${stepName}] Error ${index}: path="${err.path}", message="${err.message}"`);
          }
          if (err.path) {
            errors[err.path] = err.message;
          }
        });
        return { isValid: false, errors };
      }
      return { isValid: false, errors: { _error: 'Validation failed' } };
    }
  };
}

// ============================================================================
// UTILITY VALIDATORS
// ============================================================================

/**
 * Validate a single item against a schema
 */
export async function validateSingleItem<T extends yup.AnyObject>(
  schema: yup.ObjectSchema<T>,
  item: unknown
): Promise<ValidationResult> {
  return createStepValidator(schema)(item);
}

/**
 * Check for duplicate values in an array
 */
export function checkDuplicates<T>(
  items: T[],
  keyExtractor: (item: T) => string | undefined
): { hasDuplicates: boolean; duplicateKeys: string[] } {
  const keys = items.map(keyExtractor).filter((k): k is string => !!k);

  const seen = new Set<string>();
  const duplicates = new Set<string>();

  keys.forEach((key) => {
    if (seen.has(key)) {
      duplicates.add(key);
    } else {
      seen.add(key);
    }
  });

  return {
    hasDuplicates: duplicates.size > 0,
    duplicateKeys: Array.from(duplicates),
  };
}
