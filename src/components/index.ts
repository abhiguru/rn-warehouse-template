/**
 * Components Index
 *
 * Barrel exports for all components, organized by category.
 * Import from '@/components' for cleaner imports.
 *
 * Categories:
 * - Lists: Main list components (GRN, Dispatch, Order, Invoice)
 * - Cards: Card components for list items
 * - Modals: Bottom sheets, overlays, dialogs
 * - Forms: Form-related components
 * - Filters: Filter-related components
 * - Navigation: Tab bars, step indicators
 * - UI: Generic UI components
 */

// ============================================================================
// LIST COMPONENTS
// ============================================================================
// Note: FlashList implementations are in '@/components/lists'

// Shared list utilities
export {
  ListSkeletonCard,
  ListEmptyState,
  GenericFilterableList,
  GenericFilterableSectionList,
} from './list';
export type {
  ListEmptyStateProps,
  GenericFilterableListProps,
  GenericFilterableSectionListProps,
} from './list';

// ============================================================================
// CARD COMPONENTS
// ============================================================================
export { default as DispatchGroupCard } from './DispatchGroupCard';
export { default as DispatchHistoryCard } from './DispatchHistoryCard';
export { default as CustomerOrderSummary } from './CustomerOrderSummary';
export { default as DispatchHistorySummary } from './DispatchHistorySummary';
export { default as OrderItemCard } from './OrderItemCard';
export { default as ItemPricingCard, ItemPricingSkeletonCard } from './ItemPricingCard';
export { default as StockIndicator } from './StockIndicator';

// ============================================================================
// MODAL / BOTTOM SHEET COMPONENTS
// ============================================================================
export { default as ChangeLogBottomSheet } from './ChangeLogBottomSheet';
export { default as PrintJobsBottomSheet } from './PrintJobsBottomSheet';
export { default as DispatchHistoryFilterSheet } from './DispatchHistoryFilterSheet';
export { ImageOverlay } from './ImageOverlay';
export { PrintRangeDialog } from './PrintRangeDialog';
export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps, ConfirmVariant } from './ConfirmDialog';

// ============================================================================
// FORM COMPONENTS
// ============================================================================
export { FormStepWrapper } from './form';
export type { FormStepWrapperProps, StepConfig } from './form';

export { default as SwipeableFormStep } from './SwipeableFormStep';
export { default as FormFieldWrapper } from './FormFieldWrapper';
export { default as GRNFormHeader } from './GRNFormHeader';
export { default as GRNFormBottomNav } from './GRNFormBottomNav';
export { default as DateRangePicker } from './DateRangePicker';

// ============================================================================
// FILTER COMPONENTS
// ============================================================================
export { default as GRNFilterOverlay } from './GRNFilterOverlay';
export { default as DispatchFilterOverlay } from './DispatchFilterOverlay';
export { default as FilterChip } from './FilterChip';
export { default as QuickFilterChips } from './QuickFilterChips';

// Filter utilities from filters/
export * from './filters';

// ============================================================================
// NAVIGATION COMPONENTS
// ============================================================================
export { default as FioriTabBar } from './FioriTabBar';
export { GRNStepIndicator } from './GRNStepIndicator';
export { DispatchStepIndicator } from './DispatchStepIndicator';
export { InvoiceStepIndicator } from './InvoiceStepIndicator';
export {
  GenericStepIndicatorHeader,
  type GenericStepIndicatorHeaderProps,
  type StepColorScheme,
} from './GenericStepIndicatorHeader';
export { default as StepIndicator } from './StepIndicator';

// ============================================================================
// ERROR / STATUS COMPONENTS
// ============================================================================
export { ErrorBoundary } from './ErrorBoundary';
export { ListErrorBoundary, ListErrorFallback } from './list';
export { default as ConfigErrorScreen } from './ConfigErrorScreen';
export { default as MaintenanceScreen } from './MaintenanceScreen';
export { TokenExpiryBanner } from './TokenExpiryBanner';

// ============================================================================
// FEATURE COMPONENTS
// ============================================================================
export { default as ItemCatalogBrowser } from './ItemCatalogBrowser';
export { default as OrderManagement } from './OrderManagement';
export { default as InvoiceDetails } from './InvoiceDetails';
export { default as RecentItemsQuickAdd } from './RecentItemsQuickAdd';

// UI utilities
export * from './ui';
