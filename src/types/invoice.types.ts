// Invoice form types for creation and editing

// Invoiceable GRN (available for invoice creation)
export interface InvoiceableGrn {
  id: string;
  gr_no: string;
  date: string;
  customer_id: string;
  customer_name: string;
  sender_name: string;
  supervisor_name: string;
  total_dispatched_qty: number;
  has_uninvoiced_items: boolean;
}

// Invoice header data (form state)
export interface InvoiceHeaderData {
  inv_date: string; // ISO date string
  inv_fin_year: string; // e.g., '2025-26'
  inv_no: number;
  customer_id: string;
  customer_name: string;
  gr_id: string;
  gr_no: string;
  one_time_charge: boolean;
  discount: number;
  labour: number; // Calculated sum
  tax_amount: number; // Calculated sum
  total: number; // Calculated grand total
}

// Invoice item data loaded from GRN/Dispatch
export interface InvoiceItemData {
  // Unique identifier for this item in the form
  temp_id: string; // Used for React keys and tracking edits

  // Dispatch item reference (required for RPC)
  disp_trl_id: string; // Dispatch item ID

  // GRN item reference (required for RPC - goodsreceived_trl.id)
  grn_item_id: string;

  // Item details (from dispatch/GRN)
  item_id: string; // Catalog item ID (from items table)
  item_name: string;
  qty: number; // Dispatch quantity
  grn_original_qty: number; // Original GRN quantity for this item
  package_mark: string;
  rack: string;
  weight: number;

  // Dispatch details
  dispatch_id: string;
  dispatch_no: string;
  dispatch_date: string;

  // GRN details
  grn_id: string;
  grn_no: string;
  grn_date: string;

  // Pricing fields (editable)
  duration: number; // Months
  no_of_days: number; // Days
  charge: number; // ₹ per unit per duration
  labour_rate: number; // ₹ per unit
  tax: number; // Percentage (e.g., 18 for 18%)

  // Calculated fields (read-only)
  amount: number; // qty × charge × duration
  labour_amount: number; // qty × labourRate
  tax_amount: number; // (amount + labourAmount) × (tax/100)
  item_total: number; // amount + labourAmount + taxAmount
}

// Grouped invoice items for display (grouped by GRN line item / grnItems_id)
export interface GroupedInvoiceItems {
  item_id: string;           // grnItems_id - Unique ID for this GRN line item
  item_name: string;         // grnItems_itemName - Item name (e.g., "Gur")
  package_mark: string;      // grnItems_packageMark - Package marking to differentiate items
  total_weight: number;      // grnItems_weight - Weight per unit
  gr_quantity: number;       // grnItems_originalQty - Total quantity in GRN for this item
  total_dispatched: number;  // grnItems_totalDispatched - Total dispatched quantity
  rack: string;             // grnItems_rack - Storage rack location
  dispatches: {
    dispatch_no: string;
    dispatch_id: string;
    dispatch_date: string;
    items: InvoiceItemData[];
  }[];
}

// Edited item values (tracked separately for form control)
export interface EditedItemValues {
  duration?: number;
  no_of_days?: number;
  charge?: number;
  labour_rate?: number;
  tax?: number;
}

// Form state for Redux
export interface InvoiceFormState {
  // IDs
  invoice_id: string | null;
  selected_gr_id: string | null;

  // Form data
  header: InvoiceHeaderData;
  items: InvoiceItemData[];
  editedItems: Record<string, EditedItemValues>; // temp_id -> edited values

  // Bulk edit and override tracking
  itemOverrides: Record<string, string[]>; // temp_id -> array of overridden field names
  bulkPricing: Record<string, { charge: number; labour_rate: number; tax: number }>; // item_id -> bulk pricing
  originalDurations: Record<string, number>; // temp_id -> original duration from RPC (for one_time_charge toggle)

  // UI state
  currentStep: number;
  is_loading: boolean;
  is_saving: boolean;
  is_loading_items: boolean;

  // Error state for displaying save/load failures to user
  error: string | null;

  // Validation
  validationErrors: Record<string, string>;
}

// RPC payload types

export interface CreateInvoicePayload {
  header: {
    customer_id: string;
    customer_name: string;
    gr_id: string;
    gr_no: string;
    inv_no: number;
    inv_fin_year: number; // Convert from string to number
    inv_date: string; // ISO date string
    discount: number;
    labour: number;
    tax_amount: number;
    total: number;
    one_time_charge: boolean;
  };
  items: {
    disp_trl_id: string;
    grn_item_id: string; // GRN item ID (goodsreceived_trl.id) - required by backend
    qty: number;
    charge: number;
    labour_rate: number;
    tax: number;
    duration: number;
    no_of_days: number;
  }[];
}

export interface SavedInvoiceData {
  invoice_id: string;
  invoice_no: number;
  fin_year: string;
  customer_name: string;
  total: number;
}

// Response types

export interface NextInvoiceNumberResponse {
  success: boolean;
  data: {
    next_invoice_number: number;
    financial_year: string;
  };
  message?: string;
}

export interface InvoiceableGrnsResponse {
  success: boolean;
  data: InvoiceableGrn[];
  message?: string;
}

export interface InvoiceFormDataResponse {
  success: boolean;
  data: {
    header: Partial<InvoiceHeaderData> | InvoiceHeaderData;
    items: InvoiceItemData[];
  };
  message?: string;
}

export interface CreateInvoiceResponse {
  success: boolean;
  data: {
    invoice_id: string;
    invoice_no: number;
  };
  message?: string;
}
