/**
 * Redux Validation Middleware
 *
 * Provides synchronous validation for form actions before they reach reducers.
 * For complex async validation (like Yup schemas), use the validation helper hooks.
 *
 * This middleware:
 * 1. Intercepts form-related actions
 * 2. Validates payload data synchronously
 * 3. Sanitizes/normalizes data before it reaches the reducer
 * 4. Logs validation warnings in development
 */

import { Middleware, isAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';

// ============================================================================
// TYPES
// ============================================================================

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedPayload?: unknown;
}

type ValidatorFn = (payload: unknown, state: RootState) => ValidationResult;

// ============================================================================
// HELPER FUNCTIONS - DRY utilities for common validation patterns
// ============================================================================

/**
 * Truncate string field to max length and record error if truncated
 */
function truncateString(
  data: Record<string, unknown>,
  sanitized: Record<string, unknown>,
  field: string,
  maxLength: number,
  errors: string[],
  fieldLabel?: string
): void {
  if (typeof data[field] === 'string' && (data[field] as string).length > maxLength) {
    sanitized[field] = (data[field] as string).slice(0, maxLength);
    errors.push(`${fieldLabel || field} truncated to ${maxLength} characters`);
  }
}

/**
 * Ensure numeric field is non-negative and optionally round to integer
 */
function ensureNonNegative(
  data: Record<string, unknown>,
  sanitized: Record<string, unknown>,
  field: string,
  errors: string[],
  options: { round?: boolean; min?: number; fieldLabel?: string } = {}
): void {
  if (typeof data[field] === 'number') {
    const { round = false, min = 0, fieldLabel } = options;
    let value = data[field] as number;
    if (round) value = Math.round(value);
    value = Math.max(min, value);
    sanitized[field] = value;
    if ((data[field] as number) < min) {
      errors.push(`${fieldLabel || field} cannot be less than ${min}, set to ${min}`);
    }
  }
}

// ============================================================================
// SYNCHRONOUS VALIDATORS
// ============================================================================

/**
 * Validate and sanitize GRN header updates
 */
const validateGRNHeader: ValidatorFn = (payload) => {
  const errors: string[] = [];
  const data = payload as Record<string, unknown>;
  const sanitized = { ...data };

  // Validate string lengths
  truncateString(data, sanitized, 'registration', 12, errors, 'Registration');
  truncateString(data, sanitized, 'note', 280, errors, 'Note');
  truncateString(data, sanitized, 'sender_name', 200, errors, 'Sender name');
  truncateString(data, sanitized, 'supervisor_name', 30, errors, 'Supervisor name');

  // Validate pricing_mode enum
  if (data.pricing_mode !== undefined &&
      data.pricing_mode !== 'ONE_TIME' &&
      data.pricing_mode !== 'MONTHLY') {
    sanitized.pricing_mode = 'MONTHLY';
    errors.push('Invalid pricing mode, defaulting to MONTHLY');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedPayload: sanitized,
  };
};

/**
 * Validate and sanitize GRN item data
 */
const validateGRNItem: ValidatorFn = (payload) => {
  const errors: string[] = [];
  const data = payload as Record<string, unknown>;
  const sanitized = { ...data };

  // Ensure numeric fields are non-negative integers
  ensureNonNegative(data, sanitized, 'qty', errors, { round: true, fieldLabel: 'Quantity' });
  ensureNonNegative(data, sanitized, 'stock', errors, { round: true, fieldLabel: 'Stock' });
  ensureNonNegative(data, sanitized, 'weight', errors, { round: true, fieldLabel: 'Weight' });

  // Validate string lengths
  truncateString(data, sanitized, 'item_name', 30, errors, 'Item name');
  truncateString(data, sanitized, 'rack', 30, errors, 'Rack');
  truncateString(data, sanitized, 'package_mark', 60, errors, 'Package mark');

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedPayload: sanitized,
  };
};

/**
 * Validate and sanitize dispatch header updates
 */
const validateDispatchHeader: ValidatorFn = (payload) => {
  const errors: string[] = [];
  const data = payload as Record<string, unknown>;
  const sanitized = { ...data };

  // Validate string lengths
  truncateString(data, sanitized, 'registration', 30, errors, 'Registration');
  truncateString(data, sanitized, 'note', 250, errors, 'Note');
  truncateString(data, sanitized, 'customerName', 100, errors, 'Customer name');
  truncateString(data, sanitized, 'supervisorName', 100, errors, 'Supervisor name');

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedPayload: sanitized,
  };
};

/**
 * Validate and sanitize dispatch item data
 */
const validateDispatchItem: ValidatorFn = (payload, state) => {
  const errors: string[] = [];
  const data = payload as Record<string, unknown>;
  const sanitized = { ...data };

  // Ensure dispQuantity is positive integer
  if (typeof data.dispQuantity === 'number') {
    const qty = Math.max(1, Math.round(data.dispQuantity));
    sanitized.dispQuantity = qty;
    if (data.dispQuantity < 1) {
      errors.push('Dispatch quantity must be at least 1');
    }
  }

  // Check quantity doesn't exceed limit based on mode (create vs edit)
  if (typeof data.disp_quantity === 'number') {
    // Determine if this is an edit (item already exists in store) or create (new item)
    const isEditing = data.unique_id && state.dispatchForm?.items?.some(
      (item: { unique_id?: string }) => item.unique_id === data.unique_id
    );

    // In edit mode: allow qty up to grnItems_quantity (original GRN qty)
    // In create mode: allow qty up to grnItems_stock (available stock)
    const maxAllowedQty = isEditing
      ? (data.grnItems_quantity as number)
      : (data.grnItems_stock as number);

    if (typeof maxAllowedQty === 'number' && data.disp_quantity > maxAllowedQty) {
      sanitized.disp_quantity = maxAllowedQty;
      const limit = isEditing ? 'original GRN quantity' : 'available stock';
      errors.push(`Quantity reduced to ${limit}: ${maxAllowedQty}`);
    }
  }

  // Check for duplicate lot IDs in existing items
  if (data.grnItems_id && state.dispatchForm) {
    const existingItems = state.dispatchForm.items;
    const isDuplicate = existingItems.some(
      (item: { grnItems_id?: string; unique_id?: string }) => item.grnItems_id === data.grnItems_id && item.unique_id !== data.unique_id
    );
    if (isDuplicate) {
      errors.push('This lot has already been added to the dispatch');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedPayload: sanitized,
  };
};

/**
 * Validate invoice item data
 */
const validateInvoiceItem: ValidatorFn = (payload) => {
  const errors: string[] = [];
  const data = payload as Record<string, unknown>;
  const sanitized = { ...data };

  // Ensure numeric fields are non-negative
  ensureNonNegative(data, sanitized, 'quantity', errors, { round: true, fieldLabel: 'Quantity' });
  ensureNonNegative(data, sanitized, 'rate', errors, { fieldLabel: 'Rate' });
  ensureNonNegative(data, sanitized, 'duration', errors, { fieldLabel: 'Duration' });

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedPayload: sanitized,
  };
};

// ============================================================================
// ACTION TYPE TO VALIDATOR MAPPING
// ============================================================================

const actionValidators: Record<string, ValidatorFn> = {
  // GRN Form actions
  'grnForm/updateHeader': validateGRNHeader,
  'grnForm/addItem': validateGRNItem,
  'grnForm/updateItem': (payload, state) => {
    const data = payload as { grn_trl_id: string; item: Record<string, unknown> };
    const itemResult = validateGRNItem(data.item, state);
    return {
      ...itemResult,
      sanitizedPayload: { grn_trl_id: data.grn_trl_id, item: itemResult.sanitizedPayload },
    };
  },

  // Dispatch Form actions
  'dispatchForm/updateHeader': validateDispatchHeader,
  'dispatchForm/addItem': validateDispatchItem,
  'dispatchForm/addItems': (payload, state) => {
    const items = payload as Array<Record<string, unknown>>;
    const errors: string[] = [];
    const sanitizedItems = items.map((item) => {
      const result = validateDispatchItem(item, state);
      errors.push(...result.errors);
      return result.sanitizedPayload;
    });
    return {
      isValid: errors.length === 0,
      errors,
      sanitizedPayload: sanitizedItems,
    };
  },
  'dispatchForm/updateItem': (payload, state) => {
    const data = payload as { uniqueId: string; updates: Record<string, unknown> };
    const itemResult = validateDispatchItem(data.updates, state);
    return {
      ...itemResult,
      sanitizedPayload: { uniqueId: data.uniqueId, updates: itemResult.sanitizedPayload },
    };
  },

  // Invoice Form actions
  'invoiceForm/addItem': validateInvoiceItem,
  'invoiceForm/updateItem': (payload, state) => {
    const data = payload as { id: string; updates: Record<string, unknown> };
    const itemResult = validateInvoiceItem(data.updates, state);
    return {
      ...itemResult,
      sanitizedPayload: { id: data.id, updates: itemResult.sanitizedPayload },
    };
  },
};

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Validation Middleware
 *
 * Intercepts form actions and validates/sanitizes their payloads.
 * In development, logs validation warnings.
 * Always passes sanitized data to reducers.
 */
export const validationMiddleware: Middleware<object, RootState> =
  (store) => (next) => (action) => {
    // Only process actions that are actual Redux actions
    if (!isAction(action)) {
      return next(action);
    }

    const validator = actionValidators[action.type];

    if (!validator) {
      // No validator for this action, pass through
      return next(action);
    }

    // Run validation
    const typedAction = action as { type: string; payload: unknown };
    const state = store.getState();
    const result = validator(typedAction.payload, state);

    // Log warnings in development
    if (__DEV__ && result.errors.length > 0) {
      console.warn(
        `[ValidationMiddleware] ${action.type}:`,
        result.errors.join(', ')
      );
    }

    // Pass sanitized payload to reducer
    if (result.sanitizedPayload !== undefined) {
      return next({
        ...action,
        payload: result.sanitizedPayload,
      });
    }

    return next(action);
  };

export default validationMiddleware;
