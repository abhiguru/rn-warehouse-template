/**
 * Case Transformer Utility
 *
 * D6 Fix: Handles snake_case to camelCase conversion for backend responses.
 * Normalizes inconsistent API responses to a consistent camelCase format.
 */

/**
 * Convert a snake_case string to camelCase.
 *
 * @example
 * snakeToCamel('grn_item_id') // 'grnItemId'
 * snakeToCamel('user_profile_name') // 'userProfileName'
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert a camelCase string to snake_case.
 *
 * @example
 * camelToSnake('grnItemId') // 'grn_item_id'
 * camelToSnake('userProfileName') // 'user_profile_name'
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Check if a string is snake_case.
 */
export function isSnakeCase(str: string): boolean {
  return str.includes('_') && str === str.toLowerCase();
}

/**
 * Check if a string is camelCase.
 */
export function isCamelCase(str: string): boolean {
  return !str.includes('_') && str[0] === str[0].toLowerCase();
}

/**
 * Transform all keys in an object from snake_case to camelCase.
 * Recursively transforms nested objects and arrays.
 *
 * @example
 * transformKeysToCamel({ grn_item_id: '123', user_name: 'John' })
 * // { grnItemId: '123', userName: 'John' }
 */
export function transformKeysToCamel<T>(obj: unknown): T {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformKeysToCamel(item)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const camelKey = snakeToCamel(key);
      result[camelKey] = transformKeysToCamel(value);
    }

    return result as T;
  }

  return obj as T;
}

/**
 * Transform all keys in an object from camelCase to snake_case.
 * Recursively transforms nested objects and arrays.
 *
 * @example
 * transformKeysToSnake({ grnItemId: '123', userName: 'John' })
 * // { grn_item_id: '123', user_name: 'John' }
 */
export function transformKeysToSnake<T>(obj: unknown): T {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformKeysToSnake(item)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const snakeKey = camelToSnake(key);
      result[snakeKey] = transformKeysToSnake(value);
    }

    return result as T;
  }

  return obj as T;
}

/**
 * Normalize an object to have both snake_case and camelCase keys.
 * Useful during migration when both formats might be expected.
 *
 * @example
 * normalizeKeys({ grn_item_id: '123' })
 * // { grn_item_id: '123', grnItemId: '123' }
 */
export function normalizeKeys<T extends Record<string, unknown>>(obj: T): T & Record<string, unknown> {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  const result: Record<string, unknown> = { ...obj };

  for (const [key, value] of Object.entries(obj)) {
    if (isSnakeCase(key)) {
      const camelKey = snakeToCamel(key);
      if (!(camelKey in result)) {
        result[camelKey] = value;
      }
    } else if (isCamelCase(key)) {
      const snakeKey = camelToSnake(key);
      if (!(snakeKey in result)) {
        result[snakeKey] = value;
      }
    }
  }

  return result as T & Record<string, unknown>;
}

/**
 * Get a value from an object using either snake_case or camelCase key.
 *
 * @example
 * const id = getValueFlexible(item, 'grnItemId', 'grn_item_id');
 */
export function getValueFlexible<T>(
  obj: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string
): T | undefined {
  const snake = snakeKey || camelToSnake(camelKey);

  if (camelKey in obj) {
    return obj[camelKey] as T;
  }

  if (snake in obj) {
    return obj[snake] as T;
  }

  return undefined;
}

/**
 * Create a field mapping for transforming backend response to frontend model.
 * Handles both snake_case and camelCase from backend.
 */
export interface FieldMapping {
  /** Target field name (camelCase for frontend) */
  to: string;
  /** Source field names to check (in priority order) */
  from: string[];
  /** Default value if none found */
  defaultValue?: unknown;
  /** Transform function for the value */
  transform?: (value: unknown) => unknown;
}

/**
 * Apply field mappings to transform an object.
 *
 * @example
 * const mappings: FieldMapping[] = [
 *   { to: 'grnItemId', from: ['grnItemId', 'grn_item_id', 'id'] },
 *   { to: 'itemName', from: ['itemName', 'item_name', 'name'], defaultValue: 'Unknown' },
 * ];
 * const result = applyFieldMappings(backendData, mappings);
 */
export function applyFieldMappings(
  obj: Record<string, unknown>,
  mappings: FieldMapping[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const mapping of mappings) {
    let value: unknown = undefined;

    // Try each source field in order
    for (const sourceField of mapping.from) {
      if (sourceField in obj && obj[sourceField] !== undefined && obj[sourceField] !== null) {
        value = obj[sourceField];
        break;
      }
    }

    // Apply default if no value found
    if (value === undefined) {
      value = mapping.defaultValue;
    }

    // Apply transform if provided
    if (value !== undefined && mapping.transform) {
      value = mapping.transform(value);
    }

    // Set the result
    if (value !== undefined) {
      result[mapping.to] = value;
    }
  }

  return result;
}

/**
 * Common field mappings for GRN items
 */
export const GRN_ITEM_MAPPINGS: FieldMapping[] = [
  { to: 'grnId', from: ['grnId', 'grn_id', 'id'] },
  { to: 'grnItemId', from: ['grnItemId', 'grn_item_id'] },
  { to: 'itemName', from: ['itemName', 'item_name', 'name'], defaultValue: '' },
  { to: 'itemId', from: ['itemId', 'item_id'] },
  { to: 'customerId', from: ['customerId', 'customer_id'] },
  { to: 'customerName', from: ['customerName', 'customer_name'], defaultValue: '' },
  { to: 'originalQty', from: ['originalQty', 'original_qty', 'quantity'], defaultValue: 0 },
  { to: 'currentStock', from: ['currentStock', 'current_stock', 'stock'], defaultValue: 0 },
  { to: 'createdAt', from: ['createdAt', 'created_at'] },
  { to: 'updatedAt', from: ['updatedAt', 'updated_at'] },
];

/**
 * Common field mappings for Dispatch items
 */
export const DISPATCH_ITEM_MAPPINGS: FieldMapping[] = [
  { to: 'dispatchId', from: ['dispatchId', 'dispatch_id', 'dispId', 'disp_id', 'id'] },
  { to: 'dispatchNo', from: ['dispatchNo', 'dispatch_no', 'dispNo', 'disp_no'] },
  { to: 'dispatchDate', from: ['dispatchDate', 'dispatch_date', 'dispDate', 'disp_date'] },
  { to: 'dispatchQty', from: ['dispatchQty', 'dispatch_qty', 'dispQty', 'disp_qty', 'quantity'], defaultValue: 0 },
  { to: 'grnItemId', from: ['grnItemId', 'grn_item_id'] },
  { to: 'customerId', from: ['customerId', 'customer_id'] },
  { to: 'customerName', from: ['customerName', 'customer_name'], defaultValue: '' },
];
