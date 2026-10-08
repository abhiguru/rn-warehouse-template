/**
 * Route Parameter Validation Hook
 *
 * PR12 Fix: Validates route parameters before use.
 * Shows error screen for invalid/missing required params.
 */

import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

export interface RouteParamValidation<T> {
  /** The validated params (or null if invalid) */
  params: T | null;
  /** Whether all required params are valid */
  isValid: boolean;
  /** Error message if validation failed */
  error: string | null;
  /** Which params are missing */
  missingParams: string[];
}

/**
 * Validate that a value is a valid UUID v4
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(value);
}

/**
 * Validate that a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Hook to validate required route parameters.
 * Returns validated params or error info.
 *
 * @param requiredParams - Array of param names that must be present
 * @param validators - Optional custom validators for each param
 *
 * @example
 * // Simple usage - just check params exist
 * const { params, isValid, error } = useValidatedRouteParams<{ id: string }>(['id']);
 *
 * @example
 * // With UUID validation
 * const { params, isValid, error } = useValidatedRouteParams<{ id: string }>(
 *   ['id'],
 *   { id: isValidUUID }
 * );
 */
export function useValidatedRouteParams<T extends Record<string, string>>(
  requiredParams: (keyof T)[],
  validators?: Partial<Record<keyof T, (value: unknown) => boolean>>
): RouteParamValidation<T> {
  const rawParams = useLocalSearchParams<T>();

  return useMemo(() => {
    const missingParams: string[] = [];
    const invalidParams: string[] = [];

    for (const paramName of requiredParams) {
      const value = rawParams[paramName];

      // Check if param exists and is non-empty
      if (!isNonEmptyString(value)) {
        missingParams.push(String(paramName));
        continue;
      }

      // Run custom validator if provided
      const validator = validators?.[paramName];
      if (validator && !validator(value)) {
        invalidParams.push(String(paramName));
      }
    }

    const isValid = missingParams.length === 0 && invalidParams.length === 0;

    let error: string | null = null;
    if (missingParams.length > 0) {
      error = `Missing required parameter${missingParams.length > 1 ? 's' : ''}: ${missingParams.join(', ')}`;
    } else if (invalidParams.length > 0) {
      error = `Invalid parameter${invalidParams.length > 1 ? 's' : ''}: ${invalidParams.join(', ')}`;
    }

    return {
      params: isValid ? (rawParams as T) : null,
      isValid,
      error,
      missingParams,
    };
  }, [rawParams, requiredParams, validators]);
}

/**
 * Convenience hook for routes with a single 'id' param that should be a UUID.
 *
 * @example
 * const { id, isValid, error } = useRequiredIdParam();
 * if (!isValid) return <InvalidRouteScreen error={error} />;
 */
export function useRequiredIdParam(): {
  id: string | null;
  isValid: boolean;
  error: string | null;
} {
  const result = useValidatedRouteParams<{ id: string }>(
    ['id'],
    { id: isValidUUID }
  );

  return {
    id: result.params?.id ?? null,
    isValid: result.isValid,
    error: result.error,
  };
}

/**
 * Convenience hook for routes with a 'customerId' param.
 */
export function useRequiredCustomerIdParam(): {
  customerId: string | null;
  isValid: boolean;
  error: string | null;
} {
  const result = useValidatedRouteParams<{ customerId: string }>(
    ['customerId'],
    { customerId: isValidUUID }
  );

  return {
    customerId: result.params?.customerId ?? null,
    isValid: result.isValid,
    error: result.error,
  };
}
