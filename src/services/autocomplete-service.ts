import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { CACHE_DURATION_SHORT_MS } from '@/config/cacheConfig';
import { unwrapNestedData } from '@/utils/responseUtils';
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';

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

// Cache for recent searches
const searchCache = new Map<string, { data: AutocompleteResponse; timestamp: number }>();
const CACHE_DURATION = CACHE_DURATION_SHORT_MS;

export const getGRNAutocomplete = async (
  searchQuery: string,
  limit: number = 10
): Promise<AutocompleteResponse> => {
  try {
    // Check if query is too short
    if (!searchQuery || searchQuery.trim().length < 2) {
      return {
        success: false,
        message: 'Search query must be at least 2 characters',
        error: 'Query too short'
      };
    }

    const trimmedQuery = searchQuery.trim().toLowerCase();
    const cacheKey = `${trimmedQuery}-${limit}`;

    // Check cache
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    // Get authenticated client with JWT tokens
    const authenticatedClient = await getAuthenticatedClient();
    const { data, error } = await authenticatedClient.rpc('get_grn_autocomplete', {
      p_search_query: trimmedQuery,
      p_limit: limit
    });

    if (error) {
      console.error('[AutocompleteService] RPC error:', error);
      return {
        success: false,
        message: 'Failed to fetch autocomplete results',
        error: error.message || 'Unknown error'
      };
    }

    if (!data) {
      return {
        success: false,
        message: 'No data returned',
        error: 'Empty response'
      };
    }

    const response: AutocompleteResponse = {
      success: true,
      data: unwrapNestedData(data) || data, // Handle nested response structure (M4 fix)
      message: 'Autocomplete results retrieved successfully'
    };
    
    // Debug GRN autocomplete
    if (__DEV__ && response.data?.grnNumbers && response.data.grnNumbers.length > 0) {
      console.log('[DEBUG Autocomplete] GRN results:', response.data.grnNumbers);
    }
    

    // Cache the results
    searchCache.set(cacheKey, { data: response, timestamp: Date.now() });

    // Clean old cache entries
    if (searchCache.size > 50) {
      const entries = Array.from(searchCache.entries());
      const now = Date.now();
      entries.forEach(([key, value]) => {
        if (now - value.timestamp > CACHE_DURATION) {
          searchCache.delete(key);
        }
      });
    }

    return response;
  } catch (error) {
    console.error('[AutocompleteService] Exception:', error);
    return {
      success: false,
      message: 'An unexpected error occurred',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// M3 Fix: Using executeRPC wrapper
// New dispatch autocomplete function
export const getDispatchAutocomplete = async (
  searchQuery: string,
  limit: number = 10
): Promise<AutocompleteResponse> => {
  // Check if query is too short
  if (!searchQuery || searchQuery.trim().length < 2) {
    return {
      success: false,
      message: 'Search query must be at least 2 characters',
      error: 'Query too short'
    };
  }

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const cacheKey = `dispatch-${trimmedQuery}-${limit}`;

  // Check cache
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  // M3 Fix: Using executeRPC wrapper
  const result = await executeRPC<AutocompleteResponse['data']>(
    getAuthenticatedClient,
    'get_dispatch_autocomplete',
    {
      p_search_query: trimmedQuery,
      p_limit: limit
    },
    {
      context: 'AutocompleteService.getDispatchAutocomplete',
      errorMessage: 'Failed to fetch dispatch autocomplete results',
      unwrapNested: false,
      validateSuccess: false
    }
  );

  if (!result.success || !result.data) {
    return {
      ...createErrorResponse(
        result.error || 'Unknown error',
        result.message || 'Failed to fetch dispatch autocomplete results',
        'AutocompleteService.getDispatchAutocomplete'
      )
    };
  }

  const response: AutocompleteResponse = {
    success: true,
    data: unwrapNestedData(result.data) || result.data, // Handle nested response structure (M4 fix)
    message: 'Dispatch autocomplete results retrieved successfully'
  };

  // Cache the results
  searchCache.set(cacheKey, { data: response, timestamp: Date.now() });

  // Clean old cache entries
  if (searchCache.size > 50) {
    const entries = Array.from(searchCache.entries());
    const now = Date.now();
    entries.forEach(([key, value]) => {
      if (now - value.timestamp > CACHE_DURATION) {
        searchCache.delete(key);
      }
    });
  }

  return response;
};

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

// Clear cache utility
export const clearAutocompleteCache = () => {
  searchCache.clear();
};