import { getAuthenticatedClient, getCurrentConfig } from '@/config/supabaseConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { unwrapNestedData } from '@/utils/responseUtils';
import { executeRPC } from '@/utils/serviceErrorHandler';

// Types for autocomplete results
export interface AutocompleteItem {
  value: string;
  label: string;
  type: 'item' | 'customer' | 'grn' | 'dispatch';
  count: number;
  metadata: {
    // GRN-specific metadata
    itemId?: string;
    totalQty?: number;
    totalStock?: number;
    customerId?: string;
    lastGrnDate?: string;
    grnId?: string;
    customerName?: string;
    date?: string;
    itemCount?: number;
    invoiced?: boolean;
    // Dispatch-specific metadata
    dispatchId?: string;
    dispNo?: string;
    dispDate?: string;
    supervisorName?: string;
    totalItems?: number;
    registration?: string;
    lastDispatchDate?: string;
    totalDispatches?: number;
    totalDispatchedQty?: number;
  };
}

export interface AutocompleteSummary {
  totalResults: number;
  itemCount: number;
  customerCount: number;
  grnCount: number;
  dispatchCount?: number;  // For dispatch autocomplete
}

export interface AutocompleteResponse {
  success: boolean;
  data?: {
    items: AutocompleteItem[];
    customers: AutocompleteItem[];
    grnNumbers: AutocompleteItem[];
    dispatches?: AutocompleteItem[];  // For dispatch autocomplete
    summary: AutocompleteSummary;
    query: string;
    limit: number;
  };
  message: string;
  error?: string;
}

// Results are authorized by the backend on every search, including repeated queries.
// A local cache cannot observe assignment changes or active-session demotion.
let requestEpoch = 0;

async function getAutocomplete(
  rpcName: 'get_grn_autocomplete' | 'get_dispatch_autocomplete',
  searchQuery: string,
  limit: number
): Promise<AutocompleteResponse> {
  if (!searchQuery || searchQuery.trim().length < 2) {
    return {
      success: false,
      message: 'Search query must be at least 2 characters',
      error: 'Query too short',
    };
  }

  const generation = getSessionGeneration();
  const epoch = requestEpoch;
  try {
    const origin = getCurrentConfig().url;
    const isCurrent = () =>
      generation === getSessionGeneration() &&
      epoch === requestEpoch &&
      origin === getCurrentConfig().url;
    const staleResponse: AutocompleteResponse = {
      success: false,
      message: 'Search session changed. Please search again.',
      error: 'Search session changed',
    };
    const client = await getAuthenticatedClient();
    if (!isCurrent()) return staleResponse;
    const result = await executeRPC<AutocompleteResponse['data']>(
      async () => client,
      rpcName,
      { p_search_query: searchQuery.trim().toLowerCase(), p_limit: limit },
      {
        context: 'AutocompleteService',
        errorMessage: 'Failed to fetch autocomplete results',
        unwrapNested: false,
        validateSuccess: false,
      }
    );
    // Never return data obtained for a previous account or backend origin.
    if (!isCurrent()) return staleResponse;
    if (!result.success || !result.data) {
      return {
        success: false,
        message: result.message || 'Failed to fetch autocomplete results',
        error: result.error || 'Empty response',
      };
    }
    return {
      success: true,
      data: unwrapNestedData(result.data) || result.data,
      message: 'Autocomplete results retrieved successfully',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch autocomplete results',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export const getGRNAutocomplete = (
  searchQuery: string,
  limit: number = 10
): Promise<AutocompleteResponse> =>
  getAutocomplete('get_grn_autocomplete', searchQuery, limit);

export const getDispatchAutocomplete = (
  searchQuery: string,
  limit: number = 10
): Promise<AutocompleteResponse> =>
  getAutocomplete('get_dispatch_autocomplete', searchQuery, limit);

// Helper to format autocomplete selections for filters
export const formatAutocompleteSelection = (item: AutocompleteItem) => {
  switch (item.type) {
    case 'item':
      return {
        type: 'item' as const,
        id: item.metadata.itemId || item.value,
        label: item.label,
        value: item.value
      };
    case 'customer':
      return {
        type: 'customer' as const,
        id: item.metadata.customerId || item.value,
        label: item.label,
        value: item.value
      };
    case 'grn':
      return {
        type: 'grn' as const,
        id: item.metadata.grnId || item.value,
        label: item.label,
        value: item.value
      };
    case 'dispatch':
      return {
        type: 'dispatch' as const,
        id: item.metadata.dispatchId || item.metadata.dispNo || item.value,
        label: item.label,
        value: item.value
      };
    default:
      return null;
  }
};

// Invalidate pending searches when callers explicitly reset search state.
export const clearAutocompleteCache = () => {
  requestEpoch += 1;
};