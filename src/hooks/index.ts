/**
 * Hooks Index
 *
 * Barrel exports for all custom hooks.
 * Import from '@/hooks' for cleaner imports.
 */

export { useAuthGuard } from './useAuthGuard';
export { useDeepLinkGuard, validateGrnAccess, validateDispatchAccess, validateInvoiceAccess } from './useDeepLinkGuard';
export type { ResourceType } from './useDeepLinkGuard';
export { useConfig } from './useConfig';
export { usePrintJobPolling } from './usePrintJobPolling';
export {
  useDebounce,
  useDebouncedCallback,
  useDebouncedSearch,
  useThrottledCallback,
} from './useDebounce';

// Search/autocomplete hook
export { useSearchAutocomplete } from './useSearchAutocomplete';
export type {
  UseSearchAutocompleteOptions,
  UseSearchAutocompleteReturn,
} from './useSearchAutocomplete';

// Form hooks
export { useGRNForm } from './useGRNForm';
export type { UseGRNFormOptions, UseGRNFormReturn, GRNFormMode } from './useGRNForm';

export { useDispatchForm } from './useDispatchForm';
export type { UseDispatchFormOptions, UseDispatchFormReturn, DispatchFormMode } from './useDispatchForm';

export { useInvoiceForm } from './useInvoiceForm';
export type { UseInvoiceFormOptions, UseInvoiceFormReturn, InvoiceFormMode } from './useInvoiceForm';

// Ask before unsaved work is left (style guide §14.4)
export { useLeaveGuard } from './useLeaveGuard';
export type { LeaveGuardOptions, LeaveGuard } from './useLeaveGuard';
export { useSingleFlight } from './useSingleFlight';
export type { SingleFlight } from './useSingleFlight';
