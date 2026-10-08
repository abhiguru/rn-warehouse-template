/**
 * Utils Barrel Export
 *
 * Centralizes utility exports for cleaner imports throughout the application.
 * Import utilities like: import { createLogger, categorizeError } from '@/utils';
 */

// ============================================================================
// Logging
// ============================================================================
export { createLogger } from './logger';
export type { LogLevel } from './logger';

// ============================================================================
// Error Handling
// ============================================================================
export * from './errorHandler';
export {
  categorizeError,
  handleServiceError,
  handleServiceListError,
  isAuthError,
  isJWTSignatureError,
  getUserMessage,
  withServiceErrorHandling,
} from './serviceErrorHandler';
export type { ErrorCategory, CategorizedError } from './serviceErrorHandler';

// ============================================================================
// Caching
// ============================================================================
export {
  generateCacheKey,
  getCachedData,
  setCachedData,
  invalidateCache,
  invalidateCacheByPrefix,
  getAllCacheKeys,
  clearExpiredCache,
  clearExpiredCacheInBackground,
  getCacheStats,
} from './cacheManager';
export type { CacheOptions } from './cacheManager';

// ============================================================================
// Authentication
// ============================================================================
export * from './serviceAuth';
export * from './secureStorage';
export * from './secureSessionMarker';
export * from './authTokenUtils';

// ============================================================================
// Validation
// ============================================================================
export * from './inputValidation';

// ============================================================================
// Data Transformation
// ============================================================================
export * from './filterHelpers';
export {
  unwrapArrayResponse,
  extractArrayData,
  extractSuccess,
  extractErrorMessage,
} from './responseUtils';

// ============================================================================
// Pagination
// ============================================================================
export * from './paginationUtils';

// ============================================================================
// Business Logic
// ============================================================================
export * from './invoiceCalculations';

// ============================================================================
// Network
// ============================================================================
export {
  callRPC,
  extractPagination,
  validateUUIDParam,
  cleanRPCParams,
} from './rpcClient';
export type { RPCResponse, RPCOptions } from './rpcClient';
export { parseRpcResponse } from './responseUtils';
export type { StandardRpcResponse } from './responseUtils';

// ============================================================================
// Formatting
// ============================================================================
export * from './formatters';
