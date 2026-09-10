import { getAuthenticatedClient } from '@/config/supabaseConfig';
import {
  NextInvoiceNumberResponse,
  InvoiceableGrnsResponse,
  InvoiceFormDataResponse,
  CreateInvoiceResponse,
  CreateInvoicePayload,
  InvoiceableGrn,
  InvoiceItemData,
  InvoiceHeaderData,
} from '@/types/invoice.types';

/**
 * Get the next available invoice number
 * Uses optimized get_next_invoice_number RPC that returns formatted string (e.g., "I0000554")
 * Parses the number part for backward compatibility with existing type system
 */
export const getNextInvoiceNumber = async (
  finYear: string
): Promise<NextInvoiceNumberResponse> => {
  try {
    const authenticatedClient = await getAuthenticatedClient();

    const { data, error } = await authenticatedClient.rpc('get_next_invoice_number');

    if (error) {
      console.error('[InvoiceFormService] RPC Error:', error.message);
      throw new Error(error.message || 'Failed to get next invoice number');
    }

    if (!data) {
      return {
        success: true,
        data: {
          next_invoice_number: 1,
          financial_year: finYear,
        },
      };
    }

    // RPC returns formatted string like "I0000554"
    // Extract the numeric part for backward compatibility
    const match = data.match(/^[A-Z]*(\d+)$/);
    const invoiceNumber = match ? parseInt(match[1], 10) : 1;

    return {
      success: true,
      data: {
        next_invoice_number: invoiceNumber,
        financial_year: finYear,
      },
    };
  } catch (error: any) {
    console.error('[InvoiceFormService] Error in getNextInvoiceNumber:', error);
    // Return 1 as default for first invoice of the year
    return {
      success: false,
      data: {
        next_invoice_number: 1,
        financial_year: finYear,
      },
      message: error.message || 'Failed to get next invoice number',
    };
  }
};

/**
 * Get list of GRNs that are available for invoicing
 * Returns GRNs that have dispatched items that haven't been invoiced yet
 */
export const getInvoiceableGrns = async (
  searchTerm?: string
): Promise<InvoiceableGrnsResponse> => {
  try {
    // Extract the actual search term if it includes a reset counter suffix
    // Format: "searchTerm_resetCounter" -> extract just "searchTerm"
    const actualSearchTerm =
      searchTerm && searchTerm.includes('_') ? searchTerm.split('_')[0] : searchTerm;

    const authenticatedClient = await getAuthenticatedClient();

    // Use the same RPC as web app: get_invoiceable_grns
    const { data, error } = await authenticatedClient.rpc('get_invoiceable_grns', {
      p_search_grn_no: actualSearchTerm || null,
    });

    if (error) {
      console.error('[InvoiceFormService] Error fetching invoiceable GRNs:', error);
      throw new Error(error.message || 'Failed to fetch invoiceable GRNs');
    }

    // Handle case where RPC returns an object wrapper instead of an array
    // Backend may return: { data: [...] }, { grns: [...] }, { success: true, data: [...] }, or [...]
    let grnArray: any[] = [];
    if (Array.isArray(data)) {
      grnArray = data;
    } else if (data && typeof data === 'object') {
      // Try common wrapper patterns
      if (Array.isArray(data.data)) {
        grnArray = data.data;
      } else if (Array.isArray(data.grns)) {
        grnArray = data.grns;
      } else if (Array.isArray(data.rows)) {
        grnArray = data.rows;
      } else if (Array.isArray(data.items)) {
        grnArray = data.items;
      } else {
        // If backend returns an error object, throw it
        if (data.error || data.message) {
          throw new Error(data.error || data.message);
        }
      }
    }

    // Transform response to match mobile type structure
    // Backend uses snake_case field names
    const grns: InvoiceableGrn[] = grnArray.map((grn: any) => {
      // Handle date field - RPC returns 'gr_date'
      const grnDate = grn.gr_date || grn.grn_date || grn.date || '';

      // Handle dispatched quantity
      const dispatchedQty = grn.total_dispatched_qty || grn.dispatched_qty || grn.total_dispatched || 0;

      return {
        id: grn.grn_id,
        gr_no: grn.gr_no,
        date: grnDate,
        customer_id: grn.customer_id,
        customer_name: grn.customer_name,
        sender_name: grn.sender_name || '',
        supervisor_name: grn.supervisor_name || '',
        total_dispatched_qty: dispatchedQty,
        has_uninvoiced_items: grn.has_uninvoiced_items !== false,
      };
    });

    return {
      success: true,
      data: grns,
    };
  } catch (error: any) {
    console.error('[InvoiceFormService] Error in getInvoiceableGrns:', error);
    return {
      success: false,
      data: [],
      message: error.message || 'Failed to fetch invoiceable GRNs',
    };
  }
};

/**
 * Load invoice form data for a specific GRN
 * Fetches dispatch items grouped by dispatch, ready for invoice creation
 * Uses the same RPC as web app: generate_invoice_data_for_grn_with_pricing
 */
export const loadInvoiceFormData = async (
  grId: string
): Promise<InvoiceFormDataResponse> => {
  try {
    // Extract the actual GRN ID if it includes a reset counter suffix
    const actualGrnId = grId.includes('_') ? grId.split('_')[0] : grId;

    const authenticatedClient = await getAuthenticatedClient();

    // Use the same RPC as web app: generate_invoice_data_for_grn_with_pricing
    const { data: response, error } = await authenticatedClient.rpc(
      'generate_invoice_data_for_grn_with_pricing',
      {
        p_gr_id: actualGrnId,
      }
    );

    if (error) {
      console.error('[InvoiceFormService] Error loading invoice form data:', error);
      throw new Error(error.message || 'Failed to load invoice form data');
    }

    // Handle the wrapped response structure from RPC
    // The RPC returns { success: boolean, header: {...}, rows: [...], totals: {...} }
    const responseData = response;

    if (!responseData) {
      throw new Error('No response data from RPC - GRN may not be ready for invoicing');
    }

    // Check if this is an error response from the RPC
    if (responseData.success === false && responseData.error) {
      const errorMsg = responseData.error || 'RPC operation failed';

      // Provide user-friendly error messages for common issues
      if (errorMsg.includes('column') && errorMsg.includes('does not exist')) {
        throw new Error('Database schema error. Please contact system administrator.');
      } else if (errorMsg.includes('not be ready for invoicing')) {
        throw new Error('This GRN has no dispatched items available for invoicing.');
      } else {
        throw new Error(errorMsg);
      }
    }

    // Validate response structure
    // Handle both 'items' and 'rows' keys (backend may use either)
    const itemsData = responseData.items || responseData.rows;

    if (!responseData.header || !itemsData) {
      throw new Error('Invalid response format from RPC');
    }

    const headerData = responseData.header;

    // Check if there are any items to invoice
    if (!itemsData || itemsData.length === 0) {
      throw new Error(
        'This GRN has no dispatched items available for invoicing. Please ensure items have been dispatched first.'
      );
    }

    // Determine one_time_charge from GRN's pricing_mode
    // Check first item for pricing_mode (ONE_TIME means one_time_charge = true)
    // Also check header for pricing_mode (backend may return it at header level)
    // Handle both snake_case (grn_items_pricing_mode) and camelCase (grnItems_pricing_mode)
    const firstItem = itemsData[0];
    const rawPricingMode =
      headerData.pricing_mode ||
      firstItem?.grn_items_pricing_mode ||  // snake_case from RPC
      firstItem?.grnItems_pricing_mode ||   // camelCase variation
      firstItem?.pricing_mode ||
      'MONTHLY';
    const pricingMode = String(rawPricingMode).toUpperCase();
    const isOneTimeCharge = pricingMode === 'ONE_TIME';

    // Transform header to mobile format
    const header = {
      customer_id: headerData.customer_id,
      customer_name: headerData.customer_name,
      gr_id: headerData.grn_id,
      gr_no: headerData.grn_no,
      one_time_charge: isOneTimeCharge,
    };

    // Transform items to include temp_id and mobile-specific fields
    // Backend uses snake_case exclusively for all field names
    const items: InvoiceItemData[] = (itemsData || []).map((item: any, index: number) => {
      // Extract fields using snake_case naming from RPC response
      // grn_items_id is the GRN item record ID (goodsreceived_trl.id)
      const grnItemId = item.grn_items_id || item.grn_item_id || '';
      const catalogItemId = item.grn_items_item_id || item.item_id || '';
      const itemName = item.grn_items_item_name || item.items_catalog_name || item.item_name || '';
      const qty = item.dispatches_items_disp_qty || item.qty || 0;
      const grnOriginalQty = item.grn_items_original_qty || item.grn_original_qty || 0;
      const packageMark = item.grn_items_package_mark || item.package_mark || '';
      const rack = item.grn_items_rack || item.rack || '';
      const weight = item.grn_items_weight || item.weight || 0;

      const dispatchId = item.dispatches_id || item.dispatch_id || '';
      const dispatchNo = item.dispatches_no || item.dispatch_no || '';
      const dispatchDate = item.dispatches_date || item.dispatch_date || '';

      const grnId = item.grn_id || actualGrnId;
      const grnNo = item.grn_no || headerData.grn_no;
      const grnDate = item.grn_date || '';

      // Duration can be fractional (e.g., 7.5 months), don't round it
      const duration = item.duration || 1;
      const noOfDays = Math.round(item.no_of_days || item.billable_days || 30);

      // Pricing fields - snake_case from RPC
      const charge = item.unit_price || item.charge || 0;
      const labourRate = item.labour_rate || 0;
      const tax = item.tax_percent || item.tax || 0;

      // Debug: Log item field extraction
      if (__DEV__ && index === 0) {
        console.log('[InvoiceFormService] First item field extraction:', {
          grn_items_id: item.grn_items_id,
          grn_items_item_name: item.grn_items_item_name,
          dispatches_items_disp_qty: item.dispatches_items_disp_qty,
          dispatches_items_id: item.dispatches_items_id,
          unit_price: item.unit_price,
          labour_rate: item.labour_rate,
          tax_percent: item.tax_percent,
          extracted: { grnItemId, itemName, qty, charge, labourRate, tax },
        });
      }

      return {
        // Generate temp_id for React keys
        temp_id: `temp_${Date.now()}_${index}`,

        // Dispatch item reference (required for RPC)
        disp_trl_id: item.dispatches_items_id || item.disp_trl_id || '',

        // GRN item reference (required for RPC - goodsreceived_trl.id)
        grn_item_id: grnItemId,

        // Item details
        item_id: catalogItemId,
        item_name: itemName,
        qty: qty,
        grn_original_qty: grnOriginalQty,
        package_mark: packageMark,
        rack: rack,
        weight: weight,

        // Dispatch details
        dispatch_id: dispatchId,
        dispatch_no: dispatchNo,
        dispatch_date: dispatchDate,

        // GRN details
        grn_id: grnId,
        grn_no: grnNo,
        grn_date: grnDate,

        // Pricing fields with defaults
        duration: duration,
        no_of_days: noOfDays,
        charge: charge,
        labour_rate: labourRate,
        tax: tax,

        // Calculate initial amounts using extracted values
        amount: qty * charge * duration,
        labour_amount: qty * labourRate,
        tax_amount: ((qty * charge * duration) + (qty * labourRate)) * (tax / 100),
        item_total:
          (qty * charge * duration) +
          (qty * labourRate) +
          ((qty * charge * duration) + (qty * labourRate)) * (tax / 100),
      };
    });

    return {
      success: true,
      data: {
        header,
        items,
      },
    };
  } catch (error: any) {
    console.error('[InvoiceFormService] Error in loadInvoiceFormData:', error);
    return {
      success: false,
      data: {
        header: {
          customer_id: '',
          customer_name: '',
          gr_id: '',
          gr_no: '',
        },
        items: [],
      },
      message: error.message || 'Failed to load invoice form data',
    };
  }
};

/**
 * Create a new invoice
 * Calls the save_invoice RPC with header and items data
 * Uses the same RPC and payload structure as web app
 */
export const createInvoice = async (
  payload: CreateInvoicePayload
): Promise<CreateInvoiceResponse> => {
  try {
    const authenticatedClient = await getAuthenticatedClient();

    // Validate required fields
    if (!payload.header.customer_id) {
      throw new Error('Customer ID is required');
    }
    if (!payload.header.gr_id) {
      throw new Error('GR ID is required');
    }
    if (!payload.header.inv_date) {
      throw new Error('Invoice date is required');
    }

    // Convert financial year string to number (e.g., '2025-26' -> 2025)
    const invFinYearString = String(payload.header.inv_fin_year);
    const invFinYear = parseInt(invFinYearString.split('-')[0]);

    // Format date to match web app format: 'YYYY-MM-DD' + 'T00:00:00Z'
    const formattedDate = payload.header.inv_date.includes('T')
      ? payload.header.inv_date
      : payload.header.inv_date + 'T00:00:00Z';

    // Prepare RPC payload matching web app structure
    const invoiceData = {
      customer_id: payload.header.customer_id,
      customer_name: payload.header.customer_name,
      gr_id: payload.header.gr_id,
      gr_no: payload.header.gr_no,
      inv_no: payload.header.inv_no,
      inv_fin_year: invFinYear,
      inv_date: formattedDate,
      discount: payload.header.discount || 0,
      labour: payload.header.labour || 0,
      tax_amount: payload.header.tax_amount || 0,
      total: payload.header.total || 0,
      one_time_charge: Boolean(payload.header.one_time_charge),
      is_auto_generated: false, // Manual creation
    };

    // Transform items to match RPC expected format
    // Both disp_trl_id and grn_item_id are required by backend validation
    const invoiceItems = payload.items.map((item, index) => {
      // Validate required IDs
      if (!item.disp_trl_id) {
        throw new Error(`Item ${index + 1} is missing dispatch ID (disp_trl_id)`);
      }
      if (!item.grn_item_id) {
        throw new Error(`Item ${index + 1} is missing GRN item ID (grn_item_id)`);
      }

      return {
        disp_trl_id: item.disp_trl_id,
        grn_item_id: item.grn_item_id, // GRN item record ID (goodsreceived_trl.id)
        qty: item.qty || 0,
        charge: item.charge || 0, // Storage rate per unit per duration
        labour_rate: item.labour_rate || 0, // Labour rate per unit
        tax: item.tax || 0, // Tax percentage (e.g., 18 for 18%)
        duration: item.duration, // Duration in months
        no_of_days: item.no_of_days, // Number of days
      };
    });

    console.log('[InvoiceFormService] Calling save_invoice RPC with payload:', {
      invoiceNo: invoiceData.inv_no,
      customer: invoiceData.customer_name,
      itemsCount: invoiceItems.length,
    });

    // Call the save_invoice RPC
    const rpcPayload = {
      p_invoice_id: null, // NULL for create operation
      p_invoice_data: invoiceData,
      p_invoice_items: invoiceItems,
    };

    const { data, error } = await authenticatedClient.rpc('save_invoice', rpcPayload);

    if (error) {
      console.error('[InvoiceFormService] RPC error:', error);
      throw new Error(error.message || 'Failed to create invoice');
    }

    if (!data || !data.success) {
      const errorMsg = data?.error || data?.message || 'Failed to create invoice';
      throw new Error(errorMsg);
    }

    return {
      success: true,
      data: {
        invoice_id: data.invoice_id,
        invoice_no: data.invoice_no || payload.header.inv_no,
      },
    };
  } catch (error: any) {
    console.error('[InvoiceFormService] Error in createInvoice:', error);
    return {
      success: false,
      data: {
        invoice_id: '',
        invoice_no: 0,
      },
      message: error.message || 'Failed to create invoice',
    };
  }
};

/**
 * Helper function to transform form data to RPC payload
 */
/**
 * Load existing invoice data for editing
 * Calls get_invoice_detail RPC to fetch complete invoice with items
 */
export const loadInvoiceData = async (
  invoiceId: string
): Promise<InvoiceFormDataResponse> => {
  try {
    const authenticatedClient = await getAuthenticatedClient();

    // Call get_invoice_detail RPC
    const { data, error } = await authenticatedClient.rpc('get_invoice_detail', {
      p_invoice_id: invoiceId,
    });

    if (error) {
      console.error('[InvoiceFormService] RPC error:', error);
      throw new Error(error.message || 'Failed to fetch invoice data');
    }

    if (!data || !data.success) {
      const errorMsg = data?.error || 'Invoice not found';
      return {
        success: false,
        data: {
          header: { customer_id: '', customer_name: '', gr_id: '', gr_no: '' },
          items: [],
        },
        message: errorMsg,
      };
    }

    // Transform response to flat form state format
    // Backend returns: { success, invoice: {...}, items: [...] }
    const header = data.invoice;
    const items = data.items || [];

    // Defensive check: ensure we have the invoice header
    if (!header) {
      return {
        success: false,
        data: {
          header: { customer_id: '', customer_name: '', gr_id: '', gr_no: '' },
          items: [],
        },
        message: 'Invoice data not found in server response',
      };
    }

    // Normalize financial year to "YYYY-YY" format (e.g., "2025-26")
    // Backend may return: "2025-26" (string), 2025 (number), or "2025" (string)
    let finYear = '';
    if (header.inv_fin_year) {
      const finYearStr = String(header.inv_fin_year);
      if (/^\d{4}-\d{2}$/.test(finYearStr)) {
        // Already in correct format "2025-26"
        finYear = finYearStr;
      } else if (/^\d{4}$/.test(finYearStr)) {
        // Just a year "2025" - convert to "2025-26"
        const year = parseInt(finYearStr, 10);
        finYear = `${year}-${String(year + 1).slice(-2)}`;
      } else if (/^\d{4}-\d{4}$/.test(finYearStr)) {
        // Full format "2025-2026" - convert to "2025-26"
        const parts = finYearStr.split('-');
        finYear = `${parts[0]}-${parts[1].slice(-2)}`;
      }
    }

    // Convert header data - full InvoiceHeaderData format
    const formattedHeader: InvoiceHeaderData = {
      customer_id: header.customer_id || '',
      customer_name: header.customer_name || '',
      gr_id: header.gr_id || '',
      gr_no: header.gr_no || '',
      inv_date: header.inv_date ? header.inv_date.split('T')[0] : new Date().toISOString().split('T')[0],
      inv_fin_year: finYear,
      inv_no: typeof header.inv_no === 'string' ? parseInt(header.inv_no.replace(/\D/g, ''), 10) || 0 : header.inv_no || 0,
      one_time_charge: Boolean(header.one_time_charge),
      discount: header.discount || 0,
      labour: header.labour || 0,
      tax_amount: header.tax_amount || 0,
      total: header.total || 0,
    };

    // Convert items data - backend now returns all needed fields
    // Available: id, disp_trl_id, item_name, qty, dispatch_no, dispatch_date,
    //            duration, no_of_days, charge, tax, labour_rate

    // Debug: Log first item keys
    if (__DEV__ && items.length > 0) {
      console.log('[InvoiceFormService] loadInvoiceData item keys:', Object.keys(items[0]));
    }

    const formattedItems: InvoiceItemData[] = items.map((item: any, index: number) => {
      const charge = item.charge || 0;
      // Duration can be fractional (e.g., 7.5 months), don't round it
      const duration = item.duration || 1;
      const labour_rate = item.labour_rate || 0;
      const tax = item.tax || 0;
      const no_of_days = Math.round(item.no_of_days || 30);
      const qty = item.qty || 0;

      const amount = qty * charge * duration;
      const labour_amount = qty * labour_rate;
      const taxable_amount = amount + labour_amount;
      const tax_amount_calc = taxable_amount * (tax / 100);
      const item_total = taxable_amount + tax_amount_calc;

      return {
        // Generate temp_id for React keys
        temp_id: `edit_${item.id}_${index}`,

        // Dispatch item reference (required for RPC)
        disp_trl_id: item.disp_trl_id || '',

        // GRN item reference
        grn_item_id: item.grn_item_id || item.gr_trl_id || '',

        // Item details - now available from backend
        item_id: item.item_id || '',
        item_name: item.item_name || '',
        qty: qty,
        grn_original_qty: item.grn_original_qty || 0,
        package_mark: item.package_mark || '',
        rack: item.rack || '',
        weight: item.weight || 0,

        // Dispatch details - now available from backend
        dispatch_id: item.dispatch_id || '',
        dispatch_no: item.dispatch_no || '',
        dispatch_date: item.dispatch_date ? item.dispatch_date.split('T')[0] : '',

        // GRN details - use header values
        grn_id: header.gr_id || '',
        grn_no: header.gr_no || '',
        grn_date: '',

        // Pricing fields (editable) - from invoice_trl
        duration: duration,
        no_of_days: no_of_days,
        charge: charge,
        labour_rate: labour_rate,
        tax: tax,

        // Calculated fields
        amount: Math.round(amount * 100) / 100,
        labour_amount: Math.round(labour_amount * 100) / 100,
        tax_amount: Math.round(tax_amount_calc * 100) / 100,
        item_total: Math.round(item_total * 100) / 100,
      };
    });

    return {
      success: true,
      data: {
        header: formattedHeader,
        items: formattedItems,
      },
      message: 'Invoice data loaded successfully',
    };
  } catch (error: any) {
    console.error('[InvoiceFormService] Error loading invoice:', error);
    return {
      success: false,
      data: {
        header: { customer_id: '', customer_name: '', gr_id: '', gr_no: '' },
        items: [],
      },
      message: error.message || 'Failed to load invoice data',
    };
  }
};

/**
 * Update an existing invoice
 * Calls the update_invoice RPC with invoice ID and updated data
 */
export const updateInvoice = async (
  invoiceId: string,
  payload: CreateInvoicePayload
): Promise<CreateInvoiceResponse> => {
  try {
    const authenticatedClient = await getAuthenticatedClient();

    // Validate required fields
    if (!payload.header.customer_id) {
      throw new Error('Customer ID is required');
    }
    if (!payload.header.gr_id) {
      throw new Error('GR ID is required');
    }
    if (!payload.header.inv_date) {
      throw new Error('Invoice date is required');
    }

    // Convert financial year string to number (e.g., '2025-26' -> 2025)
    const invFinYearString = String(payload.header.inv_fin_year);
    const invFinYear = parseInt(invFinYearString.split('-')[0]);

    // Format date to match web app format: 'YYYY-MM-DD' + 'T00:00:00Z'
    const formattedDate = payload.header.inv_date.includes('T')
      ? payload.header.inv_date
      : payload.header.inv_date + 'T00:00:00Z';

    // Prepare RPC payload for update_invoice
    const invoiceData = {
      customer_id: payload.header.customer_id,
      customer_name: payload.header.customer_name,
      gr_id: payload.header.gr_id,
      gr_no: payload.header.gr_no,
      inv_no: payload.header.inv_no,
      inv_fin_year: invFinYear,
      inv_date: formattedDate,
      discount: payload.header.discount || 0,
      labour: payload.header.labour || 0,
      tax_amount: payload.header.tax_amount || 0,
      total: payload.header.total || 0,
      one_time_charge: payload.header.one_time_charge || false,
    };

    const invoiceItems = payload.items.map((item) => ({
      disp_trl_id: item.disp_trl_id,
      grn_item_id: item.grn_item_id, // GRN item record ID (goodsreceived_trl.id)
      duration: item.duration,
      no_of_days: item.no_of_days,
      charge: item.charge,
      tax: item.tax,
      labour_rate: item.labour_rate,
    }));

    // Call update_invoice RPC
    const { data, error } = await authenticatedClient.rpc('update_invoice', {
      p_invoice_id: invoiceId,
      p_invoice_data: invoiceData,
      p_invoice_items: invoiceItems,
    });

    if (error) {
      console.error('[InvoiceFormService] RPC error:', error);
      throw new Error(error.message || 'Failed to update invoice');
    }

    // RPC returns an object directly
    const result = data;

    if (!result || !result.success) {
      const errorMsg = result?.error || 'Unknown error from RPC';
      return {
        success: false,
        data: { invoice_id: '', invoice_no: 0 },
        message: errorMsg,
      };
    }

    return {
      success: true,
      data: {
        invoice_id: result.invoice_id,
        invoice_no: parseInt(result.invoice_number),
      },
      message: result.message || 'Invoice updated successfully',
    };
  } catch (error: any) {
    console.error('[InvoiceFormService] Error updating invoice:', error);
    return {
      success: false,
      data: { invoice_id: '', invoice_no: 0 },
      message: error.message || 'Failed to update invoice',
    };
  }
};

export const transformFormDataToPayload = (
  header: any,
  items: InvoiceItemData[]
): CreateInvoicePayload => {
  return {
    header: {
      customer_id: header.customer_id,
      customer_name: header.customer_name,
      gr_id: header.gr_id,
      gr_no: header.gr_no,
      inv_no: header.inv_no,
      inv_fin_year:
        typeof header.inv_fin_year === 'string'
          ? parseInt(header.inv_fin_year.split('-')[0])
          : header.inv_fin_year,
      inv_date: header.inv_date.includes('T')
        ? header.inv_date
        : header.inv_date + 'T00:00:00Z',
      discount: header.discount || 0,
      labour: header.labour || 0,
      tax_amount: header.tax_amount || 0,
      total: header.total || 0,
      one_time_charge: header.one_time_charge || false,
    },
    items: items.map((item) => ({
      disp_trl_id: item.disp_trl_id,
      grn_item_id: item.grn_item_id, // GRN item record ID (goodsreceived_trl.id)
      qty: item.qty,
      charge: item.charge,
      labour_rate: item.labour_rate,
      tax: item.tax,
      duration: item.duration,
      no_of_days: item.no_of_days,
    })),
  };
};
