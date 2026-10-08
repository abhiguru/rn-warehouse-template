/**
 * Global Type Declarations
 *
 * Provides global types, utility types, and library augmentations
 * used throughout the application.
 *
 * Issue #40: Expand global type declarations
 */

// ============================================================================
// React Native Globals
// ============================================================================

/** React Native development mode flag */
declare const __DEV__: boolean;

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Makes specified properties optional
 */
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Makes specified properties required
 */
type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Extracts the type of array elements
 */
type ArrayElement<T> = T extends (infer U)[] ? U : never;

/**
 * Makes all properties nullable
 */
type Nullable<T> = { [P in keyof T]: T[P] | null };

/**
 * Deep partial type (all nested properties optional)
 */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extracts keys of type T that have values of type V
 */
type KeysOfType<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];

/**
 * Async function return type
 */
type AsyncReturnType<T extends (...args: unknown[]) => Promise<unknown>> =
  T extends (...args: unknown[]) => Promise<infer R> ? R : never;

/**
 * Non-nullable version of a type
 */
type NonNullableFields<T> = { [P in keyof T]: NonNullable<T[P]> };

/**
 * Record with string keys and T values, or empty object
 */
type StringRecord<T> = Record<string, T> | Record<string, never>;

// ============================================================================
// Common Domain Types
// ============================================================================

/** UUID string type alias */
type UUID = string;

/** ISO date string type alias */
type ISODateString = string;

/** Phone number string (Indian format) */
type PhoneNumber = string;

/** Currency amount in paisa (integer) */
type PaisaAmount = number;

/** Weight in kilograms */
type WeightKg = number;

/** Quantity count */
type Quantity = number;

// ============================================================================
// Redux Types
// ============================================================================

/** Action with payload type */
interface ActionWithPayload<T extends string, P> {
  type: T;
  payload: P;
}

/** Action without payload */
interface ActionWithoutPayload<T extends string> {
  type: T;
}

// ============================================================================
// Navigation Types (Expo Router)
// ============================================================================

/** Common route params */
interface CommonRouteParams {
  id?: string;
  mode?: 'view' | 'edit' | 'create';
  returnTo?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/** Base API response structure */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/** Paginated API response */
interface PaginatedApiResponse<T> extends ApiResponse<T[]> {
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ============================================================================
// Form Types
// ============================================================================

/** Form field error state */
interface FieldError {
  message: string;
  type: 'required' | 'pattern' | 'min' | 'max' | 'custom';
}

/** Form validation result */
interface ValidationResult {
  isValid: boolean;
  errors: Record<string, FieldError>;
}

// ============================================================================
// Library Augmentations
// ============================================================================

// Extend react-native-paper theme types if needed
declare module 'react-native-paper' {
  interface Theme {
    // Add custom theme extensions here
  }
}

// Extend AsyncStorage types
declare module '@react-native-async-storage/async-storage' {
  // Add custom storage key types here
}

// ============================================================================
// Environment Types
// ============================================================================

/** Environment configuration */
interface EnvConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  API_URL?: string;
}

// ============================================================================
// Export for module augmentation
// ============================================================================

export {
  PartialBy,
  RequiredBy,
  ArrayElement,
  Nullable,
  DeepPartial,
  KeysOfType,
  AsyncReturnType,
  NonNullableFields,
  StringRecord,
  UUID,
  ISODateString,
  PhoneNumber,
  PaisaAmount,
  WeightKg,
  Quantity,
  ActionWithPayload,
  ActionWithoutPayload,
  CommonRouteParams,
  ApiResponse,
  PaginatedApiResponse,
  FieldError,
  ValidationResult,
  EnvConfig,
};
