/**
 * Schema Validator Utility
 *
 * D7 Fix: Lightweight schema validation for cached/stored data.
 * Validates data structure before use to prevent crashes from
 * corrupted or outdated cache formats.
 */

type ValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; error: string };

/**
 * Validate that a value is a non-null object.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate that a value is an array.
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Validate that a value is a string.
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Validate that a value is a number (not NaN).
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Validate that a value is a boolean.
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Schema definition type.
 */
type SchemaType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

interface SchemaField {
  type: SchemaType;
  required?: boolean;
  items?: Schema; // For array validation
  properties?: Schema; // For object validation
}

export type Schema = Record<string, SchemaField>;

/**
 * Validate an object against a schema.
 *
 * @example
 * const userSchema: Schema = {
 *   id: { type: 'string', required: true },
 *   name: { type: 'string', required: true },
 *   age: { type: 'number', required: false },
 * };
 *
 * const result = validateSchema(data, userSchema);
 * if (result.valid) {
 *   // Use result.data safely
 * }
 */
export function validateSchema<T>(
  data: unknown,
  schema: Schema,
  context: string = 'data'
): ValidationResult<T> {
  if (!isObject(data)) {
    return { valid: false, error: `${context}: Expected object, got ${typeof data}` };
  }

  for (const [key, field] of Object.entries(schema)) {
    const value = data[key];

    // Check required fields
    if (field.required && (value === undefined || value === null)) {
      return { valid: false, error: `${context}.${key}: Required field is missing` };
    }

    // Skip validation for undefined optional fields
    if (value === undefined || value === null) {
      continue;
    }

    // Type validation
    switch (field.type) {
      case 'string':
        if (!isString(value)) {
          return { valid: false, error: `${context}.${key}: Expected string, got ${typeof value}` };
        }
        break;

      case 'number':
        if (!isNumber(value)) {
          return { valid: false, error: `${context}.${key}: Expected number, got ${typeof value}` };
        }
        break;

      case 'boolean':
        if (!isBoolean(value)) {
          return { valid: false, error: `${context}.${key}: Expected boolean, got ${typeof value}` };
        }
        break;

      case 'object':
        if (!isObject(value)) {
          return { valid: false, error: `${context}.${key}: Expected object, got ${typeof value}` };
        }
        // Validate nested schema if provided
        if (field.properties) {
          const nestedResult = validateSchema(value, field.properties, `${context}.${key}`);
          if (!nestedResult.valid) {
            return nestedResult as ValidationResult<T>;
          }
        }
        break;

      case 'array':
        if (!isArray(value)) {
          return { valid: false, error: `${context}.${key}: Expected array, got ${typeof value}` };
        }
        // Validate array items if schema provided
        if (field.items) {
          for (let i = 0; i < value.length; i++) {
            const itemResult = validateSchema(value[i], field.items, `${context}.${key}[${i}]`);
            if (!itemResult.valid) {
              return itemResult as ValidationResult<T>;
            }
          }
        }
        break;

      case 'any':
        // No validation needed
        break;
    }
  }

  return { valid: true, data: data as T };
}

/**
 * Safe JSON parse with schema validation.
 *
 * @example
 * const result = safeParseJSON<UserProfile>(jsonString, userSchema);
 * if (result.valid) {
 *   console.log(result.data.name);
 * } else {
 *   console.error(result.error);
 * }
 */
export function safeParseJSON<T>(
  jsonString: string,
  schema?: Schema,
  context: string = 'JSON'
): ValidationResult<T> {
  try {
    const parsed = JSON.parse(jsonString);

    if (schema) {
      return validateSchema<T>(parsed, schema, context);
    }

    return { valid: true, data: parsed as T };
  } catch (error) {
    return {
      valid: false,
      error: `${context}: Invalid JSON - ${error instanceof Error ? error.message : 'Parse error'}`,
    };
  }
}

/**
 * Validate cached data with version checking.
 * Useful for detecting outdated cache formats after app updates.
 */
export interface VersionedCache<T> {
  version: string;
  data: T;
  cachedAt: number;
}

const CACHE_VERSION_SCHEMA: Schema = {
  version: { type: 'string', required: true },
  data: { type: 'any', required: true },
  cachedAt: { type: 'number', required: true },
};

export function validateVersionedCache<T>(
  cached: unknown,
  expectedVersion: string,
  context: string = 'cache'
): ValidationResult<T> {
  // Validate structure
  const structureResult = validateSchema<VersionedCache<T>>(
    cached,
    CACHE_VERSION_SCHEMA,
    context
  );

  if (!structureResult.valid) {
    return structureResult as ValidationResult<T>;
  }

  // Check version
  if (structureResult.data.version !== expectedVersion) {
    return {
      valid: false,
      error: `${context}: Version mismatch (expected ${expectedVersion}, got ${structureResult.data.version})`,
    };
  }

  return { valid: true, data: structureResult.data.data };
}

// Common schemas for reuse
export const COMMON_SCHEMAS = {
  userProfile: {
    id: { type: 'string' as const, required: true },
    name: { type: 'string' as const, required: false },
    phone: { type: 'string' as const, required: false },
    role: { type: 'string' as const, required: false },
  },

  session: {
    access_token: { type: 'string' as const, required: true },
    refresh_token: { type: 'string' as const, required: false },
    expires_at: { type: 'number' as const, required: false },
  },

  pagination: {
    total: { type: 'number' as const, required: true },
    limit: { type: 'number' as const, required: true },
    offset: { type: 'number' as const, required: true },
    hasMore: { type: 'boolean' as const, required: true },
  },
};
