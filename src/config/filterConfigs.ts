/**
 * Filter Configurations
 *
 * Centralized filter configurations for all list components.
 * This provides a single source of truth for filter definitions.
 *
 * Usage:
 * ```typescript
 * import { GRN_FILTER_CONFIG, DISPATCH_FILTER_CONFIG } from '@/config/filterConfigs';
 *
 * const { debouncedValues: filters } = useFilterState({
 *   persistKey: GRN_FILTER_CONFIG.persistKey,
 *   debounceMs: GRN_FILTER_CONFIG.debounceMs,
 * });
 * ```
 */

import type { FilterConfig } from '@/types/filter.types';

/**
 * GRN List Filter Configuration
 */
export const GRN_FILTER_CONFIG: FilterConfig = {
  persistKey: 'grn-list-mobile-v2',
  debounceMs: 500,
  title: 'Filter GRN Items',
  fields: [
    // GRN Number Range at top - non-collapsible
    {
      type: 'autocomplete',
      key: 'grNoFrom',
      label: 'GRN Number From',
      autocompleteType: 'grn',
      placeholder: 'Start of range...',
      icon: 'file-document',
      multiSelect: false,
      renderAsChips: true,
    },
    {
      type: 'autocomplete',
      key: 'grNoTo',
      label: 'GRN Number To',
      autocompleteType: 'grn',
      placeholder: 'End of range...',
      icon: 'file-document',
      multiSelect: false,
      renderAsChips: true,
    },
    {
      type: 'autocomplete',
      key: 'itemName',
      label: 'Item',
      autocompleteType: 'item',
      placeholder: 'Search items...',
      icon: 'package-variant',
      multiSelect: true,
      renderAsChips: true,
    },
    {
      type: 'autocomplete',
      key: 'customerName',
      label: 'Customer',
      autocompleteType: 'customer',
      placeholder: 'Search customers...',
      icon: 'account',
      multiSelect: true,
      renderAsChips: true,
    },
    {
      type: 'radio',
      key: 'stockStatus',
      label: 'Stock Status',
      icon: 'chart-bar',
      options: [
        { label: 'All Items', value: 'all' },
        { label: 'In Stock', value: 'in_stock', description: 'Items with stock > 0' },
        { label: 'Out of Stock', value: 'out_of_stock', description: 'Items with stock = 0' },
      ],
      defaultValue: 'all',
    },
    {
      type: 'number-range',
      key: ['weightMin', 'weightMax'],
      label: 'Weight Range (kg)',
      icon: 'weight-kilogram',
      placeholder: ['Min weight', 'Max weight'],
      minValue: 0,
    },
    {
      type: 'text',
      key: 'packageMark',
      label: 'Package',
      icon: 'tag',
      placeholder: 'Package',
    },
    {
      type: 'date-range',
      key: ['dateFrom', 'dateTo'],
      label: 'Date Range',
      icon: 'calendar-range',
      placeholder: ['From date', 'To date'],
    },
  ],
};

/**
 * Dispatch List Filter Configuration
 */
export const DISPATCH_FILTER_CONFIG: FilterConfig = {
  persistKey: 'dispatch-list-mobile-v2',
  debounceMs: 500,
  title: 'Filter Dispatches',
  fields: [
    {
      type: 'autocomplete',
      key: 'itemName',
      label: 'Item',
      autocompleteType: 'item',
      placeholder: 'Search items...',
      icon: 'package-variant',
      multiSelect: true,
      renderAsChips: true,
    },
    {
      type: 'autocomplete',
      key: 'customerName',
      label: 'Customer',
      autocompleteType: 'customer',
      placeholder: 'Search customers...',
      icon: 'account',
      multiSelect: true,
      renderAsChips: true,
    },
    {
      type: 'autocomplete',
      key: 'dispNoFrom',
      label: 'Dispatch No From',
      autocompleteType: 'dispatch',
      placeholder: 'Start of range...',
      icon: 'file-document',
      multiSelect: false,
      renderAsChips: true,
    },
    {
      type: 'autocomplete',
      key: 'dispNoTo',
      label: 'Dispatch No To',
      autocompleteType: 'dispatch',
      placeholder: 'End of range...',
      icon: 'file-document',
      multiSelect: false,
      renderAsChips: true,
    },
    {
      type: 'number-range',
      key: ['weightMin', 'weightMax'],
      label: 'Weight Range (kg)',
      icon: 'weight-kilogram',
      placeholder: ['Min weight', 'Max weight'],
      minValue: 0,
    },
    {
      type: 'text',
      key: 'packageMark',
      label: 'Package',
      icon: 'tag',
      placeholder: 'Package',
    },
    {
      type: 'date-range',
      key: ['dateFrom', 'dateTo'],
      label: 'Date Range',
      icon: 'calendar-range',
      placeholder: ['From date', 'To date'],
    },
  ],
};

/**
 * Invoice List Filter Configuration
 */
export const INVOICE_FILTER_CONFIG: FilterConfig = {
  persistKey: 'invoice-list-v2',
  debounceMs: 500,
  title: 'Filter Invoices',
  fields: [
    {
      type: 'autocomplete',
      key: 'customerName',
      label: 'Customer',
      autocompleteType: 'customer',
      placeholder: 'Search customers...',
      icon: 'account',
      multiSelect: true,
      renderAsChips: true,
    },
    {
      type: 'autocomplete',
      key: 'invoiceNoFrom',
      label: 'Invoice No From',
      autocompleteType: 'invoice',
      placeholder: 'Start of range...',
      icon: 'file-document',
      multiSelect: false,
      renderAsChips: true,
    },
    {
      type: 'autocomplete',
      key: 'invoiceNoTo',
      label: 'Invoice No To',
      autocompleteType: 'invoice',
      placeholder: 'End of range...',
      icon: 'file-document',
      multiSelect: false,
      renderAsChips: true,
    },
    {
      type: 'radio',
      key: 'paymentStatus',
      label: 'Payment Status',
      icon: 'cash-multiple',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Paid', value: 'paid' },
        { label: 'Unpaid', value: 'unpaid' },
        { label: 'Partial', value: 'partial' },
      ],
      defaultValue: 'all',
    },
    {
      type: 'number-range',
      key: ['amountMin', 'amountMax'],
      label: 'Amount Range',
      icon: 'currency-inr',
      placeholder: ['Min amount', 'Max amount'],
      minValue: 0,
    },
    {
      type: 'date-range',
      key: ['dateFrom', 'dateTo'],
      label: 'Date Range',
      icon: 'calendar-range',
      placeholder: ['From date', 'To date'],
    },
  ],
};

/**
 * Get filter configuration by type
 */
export function getFilterConfig(type: 'grn' | 'dispatch' | 'invoice'): FilterConfig {
  switch (type) {
    case 'grn':
      return GRN_FILTER_CONFIG;
    case 'dispatch':
      return DISPATCH_FILTER_CONFIG;
    case 'invoice':
      return INVOICE_FILTER_CONFIG;
    default:
      throw new Error(`Unknown filter config type: ${type}`);
  }
}

export default {
  GRN_FILTER_CONFIG,
  DISPATCH_FILTER_CONFIG,
  INVOICE_FILTER_CONFIG,
  getFilterConfig,
};
