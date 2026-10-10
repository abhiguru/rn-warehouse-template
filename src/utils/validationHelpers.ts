/**
 * Shared Yup Validation Helpers
 *
 * J16 Fix: Common validation patterns extracted for DRY compliance.
 * Used by grnValidation.ts, dispatchValidation.ts, invoiceValidation.ts
 */

import * as yup from 'yup';
import { localizeDigits, t } from '@/i18n';

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * The name of a field inside a message. A schema is usually built once, when
 * its file is loaded, so pass a function (`() => t('invoice.fields.date')`) to
 * have the name follow the app's language; a plain string is shown as it is.
 */
export type FieldName = string | (() => string);

const nameOf = (fieldName: FieldName): string =>
  typeof fieldName === 'function' ? fieldName() : fieldName;

/** A limit inside a message: the number as written in code, in the language's digits (no grouping). */
const limit = (value: number): string => localizeDigits(String(value));

// Every message below is a function: yup calls it when a value fails, so the
// text is in the language the app has at that moment, not at module load.

// ============================================================================
// COMMON FIELD VALIDATORS
// ============================================================================

/**
 * UUID validator with custom error message
 */
export const uuidField = (fieldName: FieldName) =>
  yup.string().uuid(() => t('validation.field.invalidSelection', { field: nameOf(fieldName) }));

/**
 * Required UUID validator
 */
export const requiredUuidField = (fieldName: FieldName) =>
  uuidField(fieldName).required(() => t('validation.field.required', { field: nameOf(fieldName) }));

/**
 * Required string with max length
 */
export const requiredStringField = (fieldName: FieldName, maxLength: number) =>
  yup
    .string()
    .required(() => t('validation.field.required', { field: nameOf(fieldName) }))
    .max(maxLength, () => t('validation.field.maxChars', { field: nameOf(fieldName), max: limit(maxLength) }));

/**
 * Optional string with max length
 */
export const optionalStringField = (maxLength: number, fieldName?: FieldName) =>
  yup
    .string()
    .max(maxLength, () =>
      t('validation.field.maxChars', {
        field: fieldName ? nameOf(fieldName) : t('validation.fieldName.field'),
        max: limit(maxLength),
      })
    );

/**
 * Date field that cannot be in the future
 */
export const pastDateField = (fieldName: FieldName = () => t('validation.fieldName.date')) =>
  yup
    .date()
    .required(() => t('validation.field.required', { field: nameOf(fieldName) }))
    .max(new Date(), () => t('validation.field.futureDate'));

/**
 * Date string field that cannot be in the future
 */
export const pastDateStringField = (fieldName: FieldName = () => t('validation.fieldName.date')) =>
  yup
    .string()
    .required(() => t('validation.field.required', { field: nameOf(fieldName) }))
    .test('valid-date', () => t('validation.field.invalidDateFormat'), (value) => {
      if (!value) return false;
      const date = new Date(value);
      return !isNaN(date.getTime());
    })
    .test('not-future', () => t('validation.field.futureDate'), (value) => {
      if (!value) return true;
      const date = new Date(value);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return date <= today;
    });

/**
 * Positive integer quantity field
 */
export const quantityField = (
  fieldName: FieldName = () => t('validation.fieldName.quantity'),
  minValue: number = 1
) =>
  yup
    .number()
    .required(() => t('validation.field.required', { field: nameOf(fieldName) }))
    .positive(() => t('validation.field.positive', { field: nameOf(fieldName) }))
    .integer(() => t('validation.field.wholeNumber', { field: nameOf(fieldName) }))
    .min(minValue, () => t('validation.field.min', { field: nameOf(fieldName), min: limit(minValue) }));

/**
 * Non-negative integer field (for stock, counts)
 */
export const nonNegativeIntegerField = (fieldName: FieldName = () => t('validation.fieldName.value')) =>
  yup
    .number()
    .required(() => t('validation.field.required', { field: nameOf(fieldName) }))
    .integer(() => t('validation.field.wholeNumber', { field: nameOf(fieldName) }))
    .min(0, () => t('validation.field.notNegative', { field: nameOf(fieldName) }));

/**
 * Monetary amount field (non-negative with max)
 */
export const moneyField = (
  fieldName: FieldName = () => t('validation.fieldName.amount'),
  maxValue: number = 999999.99
) =>
  yup
    .number()
    .min(0, () => t('validation.field.notNegative', { field: nameOf(fieldName) }))
    .max(maxValue, () => t('validation.field.tooLarge', { field: nameOf(fieldName) }));

/**
 * Required monetary amount field
 */
export const requiredMoneyField = (
  fieldName: FieldName = () => t('validation.fieldName.amount'),
  maxValue: number = 999999.99
) =>
  moneyField(fieldName, maxValue).required(() => t('validation.field.required', { field: nameOf(fieldName) }));

/**
 * Percentage field (0-100)
 */
export const percentageField = (fieldName: FieldName = () => t('validation.fieldName.percentage')) =>
  yup
    .number()
    .required(() => t('validation.field.required', { field: nameOf(fieldName) }))
    .min(0, () => t('validation.field.notNegative', { field: nameOf(fieldName) }))
    .max(100, () => t('validation.field.maxPercent', { field: nameOf(fieldName) }));

/**
 * Image URL field (http/https/file URI)
 */
export const imageUrlField = () =>
  yup.string().test('valid-uri', () => t('validation.field.invalidImageUrl'), (value) => {
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
    .max(maxCount, () => t('validation.field.maxImages', { count: maxCount }));

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
    .min(minCount, () => t('validation.field.minItems', { count: minCount }))
    .required(() => t('validation.field.itemsRequired'));

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
      return { isValid: false, errors: { _error: t('errors.general.validationFailed') } };
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
      return { isValid: false, errors: { _error: t('errors.general.validationFailed') } };
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
