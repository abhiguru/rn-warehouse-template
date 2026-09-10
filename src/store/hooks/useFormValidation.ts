/**
 * Form Validation Hooks
 *
 * Provides React hooks for validating form data before dispatching to Redux.
 * Uses existing Yup schemas for async validation.
 *
 * Usage:
 * ```tsx
 * const { validateAndDispatch, validationErrors, isValidating } = useDispatchFormValidation();
 *
 * // Validate before dispatch
 * const success = await validateAndDispatch(addItem(itemData), itemData, 'item');
 * if (!success) {
 *   // Show errors to user
 * }
 * ```
 */

import { useCallback, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AnyAction } from '@reduxjs/toolkit';
import type { AppDispatch } from '../index';

// Import existing validation schemas
import {
  validateStep1 as validateGRNStep1,
  validateStep2 as validateGRNStep2,
  itemSchema as grnItemSchema,
} from '@/features/grn/schemas/grnValidation';

import {
  validateStep1 as validateDispatchStep1,
  validateStep2 as validateDispatchStep2,
  validateSingleItem as validateDispatchItem,
} from '@/features/dispatch/schemas/dispatchValidation';

import {
  step1Schema as invoiceStep1Schema,
} from '@/features/invoice/schemas/invoiceValidation';

import * as yup from 'yup';

// ============================================================================
// TYPES
// ============================================================================

interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

type ValidationType =
  | 'grnHeader'
  | 'grnItem'
  | 'grnStep2'
  | 'dispatchHeader'
  | 'dispatchItem'
  | 'dispatchStep2'
  | 'invoiceHeader';

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

async function validateByType(
  data: unknown,
  type: ValidationType
): Promise<ValidationResult> {
  switch (type) {
    case 'grnHeader':
      return validateGRNStep1(data);

    case 'grnItem':
      try {
        await grnItemSchema.validate(data, { abortEarly: false });
        return { isValid: true, errors: {} };
      } catch (error) {
        if (error instanceof yup.ValidationError) {
          const errors: Record<string, string> = {};
          error.inner.forEach((err) => {
            if (err.path) errors[err.path] = err.message;
          });
          return { isValid: false, errors };
        }
        return { isValid: false, errors: { _error: 'Validation failed' } };
      }

    case 'grnStep2':
      return validateGRNStep2(data);

    case 'dispatchHeader':
      return validateDispatchStep1(data);

    case 'dispatchItem':
      return validateDispatchItem(data);

    case 'dispatchStep2':
      return validateDispatchStep2(data);

    case 'invoiceHeader':
      try {
        await invoiceStep1Schema.validate(data, { abortEarly: false });
        return { isValid: true, errors: {} };
      } catch (error) {
        if (error instanceof yup.ValidationError) {
          const errors: Record<string, string> = {};
          error.inner.forEach((err) => {
            if (err.path) errors[err.path] = err.message;
          });
          return { isValid: false, errors };
        }
        return { isValid: false, errors: { _error: 'Validation failed' } };
      }

    default:
      return { isValid: true, errors: {} };
  }
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Generic form validation hook
 * Validates data before dispatching actions to Redux
 */
export function useFormValidation() {
  const dispatch = useDispatch<AppDispatch>();
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);

  /**
   * Validate data and dispatch action if valid
   * @param action - Redux action to dispatch
   * @param data - Data to validate
   * @param type - Type of validation to perform
   * @returns true if validation passed and action was dispatched
   */
  const validateAndDispatch = useCallback(
    async (
      action: AnyAction,
      data: unknown,
      type: ValidationType
    ): Promise<boolean> => {
      setIsValidating(true);
      setValidationErrors({});

      try {
        const result = await validateByType(data, type);

        if (!result.isValid) {
          setValidationErrors(result.errors);
          return false;
        }

        dispatch(action);
        return true;
      } catch (error) {
        console.error('[useFormValidation] Validation error:', error);
        setValidationErrors({ _error: 'Validation failed unexpectedly' });
        return false;
      } finally {
        setIsValidating(false);
      }
    },
    [dispatch]
  );

  /**
   * Clear validation errors
   */
  const clearErrors = useCallback(() => {
    setValidationErrors({});
  }, []);

  /**
   * Clear specific field error
   */
  const clearFieldError = useCallback((field: string) => {
    setValidationErrors((prev) => {
      const { [field]: removed, ...rest } = prev;
      return rest;
    });
  }, []);

  return {
    validateAndDispatch,
    validationErrors,
    isValidating,
    clearErrors,
    clearFieldError,
  };
}

/**
 * GRN Form specific validation hook
 */
export function useGRNFormValidation() {
  const baseHook = useFormValidation();

  const validateHeader = useCallback(
    async (action: AnyAction, data: unknown) =>
      baseHook.validateAndDispatch(action, data, 'grnHeader'),
    [baseHook]
  );

  const validateItem = useCallback(
    async (action: AnyAction, data: unknown) =>
      baseHook.validateAndDispatch(action, data, 'grnItem'),
    [baseHook]
  );

  const validateItems = useCallback(
    async (action: AnyAction, data: unknown) =>
      baseHook.validateAndDispatch(action, data, 'grnStep2'),
    [baseHook]
  );

  return {
    ...baseHook,
    validateHeader,
    validateItem,
    validateItems,
  };
}

/**
 * Dispatch Form specific validation hook
 */
export function useDispatchFormValidation() {
  const baseHook = useFormValidation();

  const validateHeader = useCallback(
    async (action: AnyAction, data: unknown) =>
      baseHook.validateAndDispatch(action, data, 'dispatchHeader'),
    [baseHook]
  );

  const validateItem = useCallback(
    async (action: AnyAction, data: unknown) =>
      baseHook.validateAndDispatch(action, data, 'dispatchItem'),
    [baseHook]
  );

  const validateItems = useCallback(
    async (action: AnyAction, data: unknown) =>
      baseHook.validateAndDispatch(action, data, 'dispatchStep2'),
    [baseHook]
  );

  return {
    ...baseHook,
    validateHeader,
    validateItem,
    validateItems,
  };
}

/**
 * Invoice Form specific validation hook
 */
export function useInvoiceFormValidation() {
  const baseHook = useFormValidation();

  const validateHeader = useCallback(
    async (action: AnyAction, data: unknown) =>
      baseHook.validateAndDispatch(action, data, 'invoiceHeader'),
    [baseHook]
  );

  return {
    ...baseHook,
    validateHeader,
  };
}

export default useFormValidation;
