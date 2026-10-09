/**
 * Filter Autocomplete Service
 *
 * Unified API for all autocomplete search types used in the filter system.
 * Maps autocomplete types to their respective search functions.
 */

import type {
  AutocompleteType,
  AutocompleteResult,
} from '@/types/filter.types';
import { searchService } from './search-service';
import { getInvoicesList } from './invoice-service';
import type { ThemeTokens } from '@/theme/tokens';

/**
 * Unified autocomplete search function
 *
 * @param type Autocomplete type
 * @param query Search query (minimum 2 characters)
 * @param limit Maximum number of results (default: 20)
 * @returns Array of autocomplete results
 *
 * @example
 * ```typescript
 * const results = await searchAutocomplete('customer', 'Aarkay');
 * // Returns: [{ id: 'uuid', label: 'Aarkay Food Products', detail: '...', type: 'customer' }]
 * ```
 */
export async function searchAutocomplete(
  type: AutocompleteType,
  query: string,
  limit: number = 20
): Promise<AutocompleteResult[]> {
  // Validate query length
  if (!query || query.trim().length < 1) {
    return [];
  }

  const trimmedQuery = query.trim();

  if (__DEV__) console.log('[FilterAutocomplete] searchAutocomplete called:', { type, query: trimmedQuery, limit });

  try {
    switch (type) {
      case 'customer':
        return await searchCustomers(trimmedQuery, limit);

      case 'item':
        return await searchItems(trimmedQuery, limit);

      case 'grn':
        return await searchGRNNumbers(trimmedQuery, limit);

      case 'dispatch':
        return await searchDispatchNumbers(trimmedQuery, limit);

      case 'invoice':
        return await searchInvoiceNumbers(trimmedQuery, limit);

      default:
        console.warn(`Unknown autocomplete type: ${type}`);
        return [];
    }
  } catch (error) {
    console.error(`Error searching ${type} autocomplete:`, error);
    return [];
  }
}

/**
 * Search customers
 */
async function searchCustomers(
  query: string,
  limit: number
): Promise<AutocompleteResult[]> {
  try {
    const results = await searchService.searchCustomers(query);

    // Transform to AutocompleteResult format
    return results.map(result => ({
      id: result.value,
      label: result.label,
      detail: result.detail,
      type: 'customer' as AutocompleteType,
      metadata: result,
    }));
  } catch (error) {
    console.error('Error searching customers:', error);
    return [];
  }
}

/**
 * Search items (GRN items)
 */
async function searchItems(
  query: string,
  limit: number
): Promise<AutocompleteResult[]> {
  try {
    const results = await searchService.searchGRNItems(query);

    // Transform to AutocompleteResult format
    return results.map(result => ({
      id: result.value,
      label: result.label,
      detail: result.detail,
      type: 'item' as AutocompleteType,
      metadata: result,
    }));
  } catch (error) {
    console.error('Error searching items:', error);
    return [];
  }
}

/**
 * Search GRN numbers
 */
async function searchGRNNumbers(
  query: string,
  limit: number
): Promise<AutocompleteResult[]> {
  try {
    const results = await searchService.searchGRNNumbers(query);

    // Transform to AutocompleteResult format and sort ascending alphanumerically
    // localeCompare with numeric: true handles "GR0001" < "GR0002" < "GR0010" correctly
    return results.map(result => ({
      id: result.value,
      label: result.label,
      detail: result.detail,
      type: 'grn' as AutocompleteType,
      metadata: result,
    })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  } catch (error) {
    console.error('Error searching GRN numbers:', error);
    return [];
  }
}

/**
 * Search dispatch numbers
 */
async function searchDispatchNumbers(
  query: string,
  limit: number
): Promise<AutocompleteResult[]> {
  if (__DEV__) console.log('[FilterAutocomplete] searchDispatchNumbers called:', { query, limit });
  try {
    const results = await searchService.searchDispatches(query);
    if (__DEV__) console.log('[FilterAutocomplete] searchDispatchNumbers results:', results.length);

    // Transform to AutocompleteResult format and sort ascending alphanumerically
    // localeCompare with numeric: true handles "#I0001" < "#I0002" < "#I0010" correctly
    return results.map(result => ({
      id: result.value,
      label: result.label,
      detail: result.detail,
      type: 'dispatch' as AutocompleteType,
      metadata: result,
    })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  } catch (error) {
    console.error('Error searching dispatch numbers:', error);
    return [];
  }
}

/**
 * Search invoice numbers
 */
async function searchInvoiceNumbers(
  query: string,
  limit: number
): Promise<AutocompleteResult[]> {
  try {
    const response = await getInvoicesList({
      p_search_invoice_no: query,
      p_limit: limit,
    });

    if (!response.success || !response.data?.invoices) {
      return [];
    }

    // Sort invoices by invoice_number first, then transform to AutocompleteResult format
    // This helps users select range values (From/To) in order
    return response.data.invoices
      .sort((a, b) => (a.invoice_number ?? 0) - (b.invoice_number ?? 0))
      .map(invoice => ({
        id: invoice.invoice_id,
        label: invoice.inv_name || `INV-${invoice.invoice_number}`,
        detail: `${invoice.customer.name} • ${invoice.grn.gr_no} • ₹${invoice.total.toFixed(2)}`,
        type: 'invoice' as AutocompleteType,
        metadata: invoice,
      }));
  } catch (error) {
    console.error('Error searching invoice numbers:', error);
    return [];
  }
}

/**
 * Get display label for autocomplete type
 *
 * @param type Autocomplete type
 * @returns User-friendly label for the type
 */
export function getAutocompleteTypeLabel(type: AutocompleteType): string {
  switch (type) {
    case 'customer':
      return 'Customer';
    case 'item':
      return 'Item';
    case 'grn':
      return 'GRN number';
    case 'dispatch':
      return 'Dispatch number';
    case 'invoice':
      return 'Invoice number';
    default:
      return 'Unknown';
  }
}

/**
 * Get search placeholder text for autocomplete type
 *
 * @param type Autocomplete type
 * @returns Placeholder text for search input
 */
export function getAutocompletePlaceholder(type: AutocompleteType): string {
  switch (type) {
    case 'customer':
      return 'Search customers...';
    case 'item':
      return 'Search items...';
    case 'grn':
      return 'Search GRN numbers...';
    case 'dispatch':
      return 'Search dispatch numbers...';
    case 'invoice':
      return 'Search invoice numbers...';
    default:
      return 'Search...';
  }
}

/**
 * Get icon for autocomplete type
 *
 * @param type Autocomplete type
 * @returns Emoji icon for the type
 */
export function getAutocompleteIcon(type: AutocompleteType): string {
  switch (type) {
    case 'customer':
      return '👤';
    case 'item':
      return '📦';
    case 'grn':
      return '📋';
    case 'dispatch':
      return '🚚';
    case 'invoice':
      return '🧾';
    default:
      return '🔍';
  }
}

/**
 * Get chip colours for an autocomplete selection.
 *
 * Selected values are applied filters, so every type uses the applied-filter chip
 * colours (style guide §13.5: brand.subtle background, brand.tint text). The type
 * is told apart by the chip's icon and label, never by colour alone.
 *
 * @param _type Autocomplete type (kept for API compatibility)
 * @param tokens Semantic tokens for the current brand and mode
 * @returns Object with backgroundColor and textColor
 */
export function getAutocompleteChipColor(
  _type: AutocompleteType,
  tokens: ThemeTokens
): {
  backgroundColor: string;
  textColor: string;
} {
  return {
    backgroundColor: tokens.brand.subtle,
    textColor: tokens.brand.tint,
  };
}
