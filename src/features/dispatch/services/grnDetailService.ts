/**
 * GRN Detail Service
 * Handles fetching GRN details and items for dispatch form
 * Provides autocomplete search for GRN numbers
 */

import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type {
  GRNDetailResponse,
  GRNDetailHeader,
  GRNDetailItem,
  GRNAutocompleteItem,
} from '@/types/dispatch.types';

// ============================================================================
// SEARCH GRN NUMBERS (Autocomplete)
// ============================================================================

/**
 * Search GRN numbers with autocomplete
 * Used in GRNAutocompleteBottomSheet
 */
export const searchGRNNumbers = async (
  query: string,
  customerId?: string
): Promise<GRNAutocompleteItem[]> => {
  try {
    console.log('[GRNDetailService] Searching GRN numbers with query:', query);

    if (!query || query.trim().length === 0) {
      return [];
    }

    const authenticatedClient = await getAuthenticatedClient();

    // Build query
    let queryBuilder = authenticatedClient
      .from('goodsreceived')
      .select('id, gr_no, date, customer_name')
      .ilike('gr_no', `%${query}%`)
      .order('gr_no', { ascending: false })
      .limit(50);

    // Optionally filter by customer if provided
    if (customerId) {
      queryBuilder = queryBuilder.eq('customer_id', customerId);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      console.error('[GRNDetailService] Error searching GRN numbers:', error);
      throw new Error(error.message || 'Failed to search GRN numbers');
    }

    const results: GRNAutocompleteItem[] = (data || []).map((item: any) => ({
      id: item.id,
      gr_no: item.gr_no,
      date: item.date,
      customer_name: item.customer_name,
    }));

    console.log('[GRNDetailService] Found', results.length, 'GRN numbers');
    return results;
  } catch (error) {
    console.error('[GRNDetailService] Exception searching GRN numbers:', error);
    throw error;
  }
};

// ============================================================================
// GET GRN PREFIXES WITH STOCK
// ============================================================================

/**
 * GRN Prefix with stock count
 */
export interface GRNPrefixWithStock {
  prefix: string;
  grnCount: number;
}

/**
 * Get distinct GRN prefixes that have items with stock > 0
 * Used for dynamic quick-search buttons in GRNAutocompleteBottomSheet
 */
export const getGRNPrefixesWithStock = async (
  customerId?: string
): Promise<GRNPrefixWithStock[]> => {
  try {
    console.log('[GRNDetailService] Fetching GRN prefixes with stock, customerId:', customerId);

    const authenticatedClient = await getAuthenticatedClient();

    const { data, error } = await authenticatedClient.rpc('get_grn_prefixes_with_stock', {
      p_customer_id: customerId || null,
    });

    if (error) {
      console.error('[GRNDetailService] Error fetching GRN prefixes:', error);
      throw new Error(error.message || 'Failed to fetch GRN prefixes');
    }

    // Handle nested data structure: { data: [...], success: true }
    const itemsArray = Array.isArray(data) ? data : (data?.data || []);

    const results: GRNPrefixWithStock[] = itemsArray.map((item: any) => ({
      prefix: item.prefix,
      grnCount: item.grn_count,
    }));

    console.log('[GRNDetailService] Found prefixes:', results.map(p => p.prefix).join(', '));
    return results;
  } catch (error) {
    console.error('[GRNDetailService] Exception fetching GRN prefixes:', error);
    throw error;
  }
};

// ============================================================================
// GET CUSTOMER GRNs WITH STOCK (Sorted by Dispatch Date)
// ============================================================================

/**
 * GRN with stock for customer (used as default list)
 */
export interface CustomerGRNWithStock {
  grnId: string;
  grNo: string;
  grnDate: string;
  customerName: string;
  totalStock: number;
  itemCount: number;
  lastDispatchDate: string | null;
}

/**
 * Get GRNs with non-zero stock for a customer, sorted by most recent dispatch date
 * Used as default list when GRN search bottom sheet loads
 */
export const getCustomerGRNsWithStock = async (
  customerId: string,
  limit: number = 20,
  offset: number = 0
): Promise<CustomerGRNWithStock[]> => {
  try {
    console.log('[GRNDetailService] Fetching customer GRNs with stock, customerId:', customerId);

    if (!customerId) {
      console.log('[GRNDetailService] No customer ID provided, returning empty list');
      return [];
    }

    const authenticatedClient = await getAuthenticatedClient();

    const { data, error } = await authenticatedClient.rpc('get_customer_grns_with_stock_dispatch_sorted', {
      p_customer_id: customerId,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error('[GRNDetailService] Error fetching customer GRNs:', error);
      throw new Error(error.message || 'Failed to fetch customer GRNs');
    }

    // Handle nested data structure: { data: [...], success: true }
    const itemsArray = Array.isArray(data) ? data : (data?.data || []);

    const results: CustomerGRNWithStock[] = itemsArray.map((item: any) => ({
      grnId: item.grn_id,
      grNo: item.gr_no,
      grnDate: item.grn_date,
      customerName: item.customer_name,
      totalStock: item.total_stock,
      itemCount: item.item_count,
      lastDispatchDate: item.last_dispatch_date,
    }));

    console.log('[GRNDetailService] Found', results.length, 'GRNs with stock for customer');
    return results;
  } catch (error) {
    console.error('[GRNDetailService] Exception fetching customer GRNs:', error);
    throw error;
  }
};

// ============================================================================
// GET GRN DETAIL BY GR NUMBER
// ============================================================================

/**
 * Fetch complete GRN detail by GR number
 * Returns header and items with stock information
 * Used in Step 2 after user selects a GRN
 * Uses get_grn_details() RPC function
 * @param grNo - GRN number to fetch
 * @param includeZeroStock - If true, include items with stock=0 (useful for edit mode)
 */
export const getGRNDetailByNumber = async (
  grNo: string,
  includeZeroStock: boolean = false
): Promise<GRNDetailResponse> => {
  try {
    console.log('[GRNDetailService] Fetching GRN detail for:', grNo);

    const authenticatedClient = await getAuthenticatedClient();

    // First, get the GRN ID from GR number using direct query (lightweight)
    const { data: grnLookup, error: grnError } = await authenticatedClient
      .from('goodsreceived')
      .select('id, gr_no, date, customer_name, customer_id')
      .eq('gr_no', grNo)
      .single();

    if (grnError || !grnLookup) {
      console.error('[GRNDetailService] Error fetching GRN:', grnError);
      throw new Error(grnError?.message || 'GRN not found');
    }

    // Use RPC function to get full details with items
    const { data: rpcData, error: rpcError } = await authenticatedClient.rpc('get_grn_details', {
      p_grn_id: grnLookup.id,
    });

    if (rpcError) {
      console.error('[GRNDetailService] Error calling get_grn_details RPC:', rpcError);
      throw new Error(rpcError.message || 'Failed to load GRN details');
    }

    console.log('[GRNDetailService] RPC Response received, success:', rpcData?.success);

    if (!rpcData) {
      throw new Error('No data returned from RPC');
    }

    // RPC response structure: { success, message, data: { grn: {...} } }
    if (!rpcData.success || !rpcData.data || !rpcData.data.grn) {
      throw new Error(rpcData.message || 'Failed to load GRN details');
    }

    const grnData = rpcData.data.grn;

    console.log('[GRNDetailService] GRN data structure:', {
      hasGrNo: !!grnData.grNo,
      hasGr_no: !!grnData.gr_no,
      hasCustomerDetails: !!grnData.customerDetails,
      hasCustomer_details: !!grnData.customer_details,
      hasCustomerName: !!grnData.customer_name,
      keys: Object.keys(grnData).slice(0, 10),
    });

    // Extract header information - handle both camelCase and snake_case
    const customerDetails = grnData.customerDetails || grnData.customer_details || {};
    const header: GRNDetailHeader = {
      id: grnData.id,
      gr_no: grnData.grNo || grnData.gr_no,
      date: grnData.date,
      customer_name: customerDetails.name || grnData.customer_name || '',
      customer_id: customerDetails.id || grnData.customer_id || '',
    };

    // Items are nested inside grn.items, not at the top level
    // Transform items - filter based on includeZeroStock parameter
    // Handle both camelCase and snake_case field names
    const items: GRNDetailItem[] = (grnData.items || [])
      .filter((item: any) => includeZeroStock || item.stock > 0)
      .map((item: any) => ({
        id: item.id, // This is gr_trl_id - the lot ID
        item_id: item.itemDetails?.id || item.item_details?.id || item.item_id || '', // Item master ID
        item_name: item.itemName || item.item_name || '',
        quantity: item.qty || item.quantity || 0,
        stock: item.stock || 0,
        package_mark: item.packageMark || item.package_mark || '',
        rack: item.rack || '',
        weight: item.weight || 0,
      }));

    console.log('[GRNDetailService] Loaded GRN detail:', {
      gr_no: header.gr_no,
      itemCount: items.length,
      itemsWithStock: items.filter((item) => item.stock > 0).length,
    });

    return {
      success: true,
      data: {
        grn: header,
        items,
      },
    };
  } catch (error: any) {
    console.error('[GRNDetailService] Exception fetching GRN detail:', error);
    return {
      success: false,
      error: error.message || 'Failed to load GRN detail',
    };
  }
};

// ============================================================================
// GET GRN DETAIL BY ID
// ============================================================================

/**
 * Fetch complete GRN detail by GRN ID
 * Alternative to getGRNDetailByNumber when ID is known
 * Uses get_grn_details() RPC function
 */
export const getGRNDetailById = async (grnId: string): Promise<GRNDetailResponse> => {
  try {
    console.log('[GRNDetailService] Fetching GRN detail for ID:', grnId);

    const authenticatedClient = await getAuthenticatedClient();

    // Use RPC function to get full details with items
    const { data: rpcData, error: rpcError } = await authenticatedClient.rpc('get_grn_details', {
      p_grn_id: grnId,
    });

    if (rpcError) {
      console.error('[GRNDetailService] Error calling get_grn_details RPC:', rpcError);
      throw new Error(rpcError.message || 'Failed to load GRN details');
    }

    if (!rpcData) {
      throw new Error('No data returned from RPC');
    }

    // RPC response structure: { success, message, data: { grn: {...} } }
    if (!rpcData.success || !rpcData.data || !rpcData.data.grn) {
      throw new Error(rpcData.message || 'Failed to load GRN details');
    }

    const grnData = rpcData.data.grn;

    // Extract header information - handle both camelCase and snake_case
    const customerDetails = grnData.customerDetails || grnData.customer_details || {};
    const header: GRNDetailHeader = {
      id: grnData.id,
      gr_no: grnData.grNo || grnData.gr_no,
      date: grnData.date,
      customer_name: customerDetails.name || grnData.customer_name || '',
      customer_id: customerDetails.id || grnData.customer_id || '',
    };

    // Items are nested inside grn.items
    // Transform items - only include items with stock > 0
    // Handle both camelCase and snake_case field names
    const items: GRNDetailItem[] = (grnData.items || [])
      .filter((item: any) => item.stock > 0)
      .map((item: any) => ({
        id: item.id, // This is gr_trl_id - the lot ID
        item_id: item.itemDetails?.id || item.item_details?.id || item.item_id || '', // Item master ID
        item_name: item.itemName || item.item_name || '',
        quantity: item.qty || item.quantity || 0,
        stock: item.stock || 0,
        package_mark: item.packageMark || item.package_mark || '',
        rack: item.rack || '',
        weight: item.weight || 0,
      }));

    console.log('[GRNDetailService] Loaded GRN detail by ID:', {
      gr_no: header.gr_no,
      itemCount: items.length,
    });

    return {
      success: true,
      data: {
        grn: header,
        items,
      },
    };
  } catch (error: any) {
    console.error('[GRNDetailService] Exception fetching GRN detail:', error);
    return {
      success: false,
      error: error.message || 'Failed to load GRN detail',
    };
  }
};

// ============================================================================
// GET ITEMS BY GRN (Grouped by Item)
// ============================================================================

/**
 * Get GRN items grouped by item_id
 * Useful for showing unique items and their lots
 * Uses get_grn_details() RPC function
 */
export const getGRNItemsGroupedByItem = async (
  grnId: string
): Promise<{
  success: boolean;
  data?: Array<{
    itemId: string;
    itemName: string;
    lots: GRNDetailItem[];
  }>;
  error?: string;
}> => {
  try {
    console.log('[GRNDetailService] Fetching GRN items grouped by item for GRN ID:', grnId);

    const authenticatedClient = await getAuthenticatedClient();

    // Use RPC function to get full details with items
    const { data: rpcData, error: rpcError } = await authenticatedClient.rpc('get_grn_details', {
      p_grn_id: grnId,
    });

    if (rpcError) {
      console.error('[GRNDetailService] Error calling get_grn_details RPC:', rpcError);
      throw new Error(rpcError.message || 'Failed to load GRN details');
    }

    if (!rpcData) {
      throw new Error('No data returned from RPC');
    }

    // RPC response structure: { success, message, data: { grn: {...} } }
    if (!rpcData.success || !rpcData.data || !rpcData.data.grn) {
      throw new Error(rpcData.message || 'Failed to load GRN details');
    }

    const grnData = rpcData.data.grn;

    // Filter items with stock > 0
    const itemsWithStock = (grnData.items || []).filter((item: any) => item.stock > 0);

    // Group by item_id
    const groupedMap = new Map<
      string,
      {
        itemId: string;
        itemName: string;
        lots: GRNDetailItem[];
      }
    >();

    itemsWithStock.forEach((item: any) => {
      const itemId = item.itemDetails?.id || item.id; // Item master ID
      const lot: GRNDetailItem = {
        id: item.id,
        item_id: itemId,
        item_name: item.itemName,
        quantity: item.qty,
        stock: item.stock,
        package_mark: item.packageMark || '',
        rack: item.rack || '',
        weight: item.weight || 0,
      };

      const existing = groupedMap.get(itemId);
      if (existing) {
        existing.lots.push(lot);
      } else {
        groupedMap.set(itemId, {
          itemId,
          itemName: item.itemName,
          lots: [lot],
        });
      }
    });

    const grouped = Array.from(groupedMap.values());

    console.log('[GRNDetailService] ✅ Grouped items:', {
      uniqueItems: grouped.length,
      totalLots: itemsWithStock.length,
    });

    return {
      success: true,
      data: grouped,
    };
  } catch (error: any) {
    console.error('[GRNDetailService] Exception grouping GRN items:', error);
    return {
      success: false,
      error: error.message || 'Failed to group GRN items',
    };
  }
};
