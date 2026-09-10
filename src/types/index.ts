/**
 * Types Barrel Export
 *
 * Centralizes all type exports for easy importing throughout the application.
 * Import types like: import { Customer, GRNItem, FilterConfig } from '@/types';
 *
 * Issue #28: Types scattered across files - now consolidated here.
 */

// ============================================================================
// Legacy User Types (for backward compatibility)
// ============================================================================

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

// ============================================================================
// Domain Type Exports
// ============================================================================

// Dispatch domain types
export * from './dispatch.types';

// Invoice domain types
export * from './invoice.types';

// Order domain types
export * from './order.types';

// Stock domain types
export * from './stock.types';

// User domain types
export * from './user.types';

// Sensor domain types
export * from './sensor.types';

// Item pricing types
export * from './item-pricing.types';

// Report types
export * from './report.types';

// ============================================================================
// Service & Infrastructure Types
// ============================================================================

// Service layer types (pagination, responses, errors)
export * from './service.types';

// Filter system types
export * from './filter.types';

// RPC response types (raw backend data - legacy dual-naming)
export * from './rpc.types';

// Canonical RPC types (snake_case only)
// NOTE: To avoid conflicts with rpc.types.ts, import directly from '@/types/rpc-canonical.types'
// Only re-export types that don't conflict:
export type {
  // Common types
  RpcPagination,
  RpcError,
  RpcErrorCode,
  // GRN types
  RpcGrnItemRow,
  RpcGrnStatistics,
  RpcGrnInvoicesSummary,
  RpcGrnDispatchesSummary,
  RpcGrnItemFull,
  RpcItemMapping,
  RpcSaveGrnResponseData,
  RpcGrnExistsData,
  RpcGrnActivityItem,
  RpcGrnActivityData,
  RpcGrnPrefixItem,
  RpcGrnListResponse,
  RpcGrnDetailsResponse,
  RpcSaveGrnResponse,
  RpcGrnExistsResponse,
  RpcGrnActivityResponse,
  RpcGrnPrefixesResponse,
  // Dispatch types
  RpcStockUpdate,
  RpcCreateDispatchResponseData,
  RpcDispatchListItem,
  RpcDispatchItemDetails,
  RpcDispatchStatistics,
  RpcDispatchGrnsSummary,
  RpcDispatchInvoicesSummary,
  RpcDispatchDetails,
  RpcDeleteDispatchResponseData,
  RpcVehicleSuggestion,
  RpcDispatchListResponse,
  RpcDispatchDetailsResponse,
  RpcCreateDispatchResponse,
  RpcDeleteDispatchResponse,
  RpcVehicleSuggestionsResponse,
  // Order types
  RpcOrderListItem as RpcOrderListItemCanonical,
  RpcOrderItemDetail as RpcOrderItemDetailCanonical,
  RpcEnhancedGrnItem as RpcEnhancedGrnItemCanonical,
  RpcSearchMetadata as RpcSearchMetadataCanonical,
} from './rpc-canonical.types';

// ============================================================================
// Global Utility Types (from global.d.ts)
// ============================================================================

export type {
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
  FieldError,
  ValidationResult,
  EnvConfig,
} from './global.d';
