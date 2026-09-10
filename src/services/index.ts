/**
 * Services Barrel Export
 *
 * Centralizes service exports for cleaner imports throughout the application.
 * Import services like: import { getGRNItems, getDispatches } from '@/services';
 *
 * Issue #21: Services directory organization - barrel export added.
 *
 * Services are organized by domain:
 * - GRN: grn-service, grn-detail-service
 * - Dispatch: dispatch-service, dispatch-detail-service
 * - Order: order-service, change-log-service
 * - Invoice: invoice-service
 * - User: user-service, user-core-service
 * - Search: search-service, autocomplete-service, filter-autocomplete-service
 * - Recent: recent-customers-service, recent-items-service, session-recent-items-service
 * - Infrastructure: configService, print-service, sensor-service
 * - Pricing: item-pricing-service
 */

// ============================================================================
// GRN Services
// ============================================================================
export * from './grn-service';
export * from './grn-detail-service';

// ============================================================================
// Dispatch Services
// ============================================================================
export * from './dispatch-service';
// Re-export dispatch-detail-service with canonical types
export {
  getDispatchDetails,
  type RpcDispatchDetails,
  type DispatchDetailsResponse,
  type RpcDispatchItemDetails,
  type ProcessedDispatchImage,
} from './dispatch-detail-service';

// ============================================================================
// Order Services
// ============================================================================
export * from './order-service';
export * from './change-log-service';

// ============================================================================
// Invoice Services
// ============================================================================
export * from './invoice-service';

// ============================================================================
// User Services
// ============================================================================
export * from './user-service';
export * from './user-core-service';

// ============================================================================
// Search & Autocomplete Services
// ============================================================================
export * from './search-service';
export * from './autocomplete-service';
export * from './filter-autocomplete-service';

// ============================================================================
// Recent Items Services
// ============================================================================
export * from './recent-customers-service';
export * from './recent-items-service';
export * from './session-recent-items-service';

// ============================================================================
// Infrastructure Services
// ============================================================================
export * from './configService';
export * from './print-service';
export * from './sensor-service';

// ============================================================================
// Pricing Services
// ============================================================================
export * from './item-pricing-service';
