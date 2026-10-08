/**
 * Dispatch Form Type Definitions
 * Defines all TypeScript interfaces for dispatch form state, API payloads, and entities
 */

// ============================================================================
// DISPATCH IMAGE
// ============================================================================

export interface DispatchImageData {
  id: string;
  file_name: string;
  image_url: string;
  upload_status: 'uploading' | 'completed' | 'failed' | 'pending';
  upload_progress?: number;
  storage_path?: string;
  file_size?: number;
  mime_type?: string;
}

// ============================================================================
// DISPATCH HEADER
// ============================================================================

export interface DispatchHeaderData {
  disp_no: string;              // Dispatch number (e.g., "D2487")
  disp_date: string;            // ISO timestamp
  registration: string;         // Vehicle registration (uppercase)
  customer_id: string;          // UUID
  customer_name: string;
  customer_address?: string;    // First line of customer address for display
  customer_city?: string;       // Customer city
  customer_mobile?: string;     // Customer mobile number
  supervisor_id: string;        // UUID
  supervisor_name: string;
  note: string;                 // Max 250 chars, optional
  source_order_id?: string;     // For future order-to-dispatch conversion
  source_order_no?: string;     // Order reference number
}

// ============================================================================
// DISPATCH ITEM
// ============================================================================

export interface DispatchItemData {
  // Unique identifier for React keys
  unique_id: string;

  // GRN Header reference
  grns_id: string;             // GRN header ID (gr_id)
  grns_gr_no: string;           // GRN number
  grns_date: string;           // ISO timestamp
  grns_customer_name: string;

  // GRN Item (lot) reference - the specific lot being dispatched
  grnItems_id: string;         // Lot ID (gr_trl_id) - CRITICAL: This is the lot reference
  grnItems_item_id: string;     // Item master ID
  grnItems_item_name: string;
  grnItems_quantity: number;   // Original GRN quantity
  grnItems_stock: number;      // Available stock for this lot
  grnItems_package_mark: string;
  grnItems_rack: string;
  grnItems_weight: number;

  // Dispatch quantity
  disp_quantity: number;        // User-entered dispatch quantity
  original_disp_quantity?: number; // Previous dispatch quantity (for edit mode validation)
}

// ============================================================================
// FORM STATE
// ============================================================================

export interface DispatchFormState {
  // IDs
  dispatch_id: string | null;   // Database ID after creation

  // Form data
  header: DispatchHeaderData;
  items: DispatchItemData[];
  images: DispatchImageData[]; // Optional dispatch images

  // UI state
  current_step: number;         // 0-based (0=step1, 1=step2, 2=step3)
  is_loading: boolean;
  is_saving: boolean;

  // Error state for displaying save/load failures to user
  error: string | null;

  // Validation
  validationErrors: Record<string, string>;
}

// ============================================================================
// API PAYLOADS
// ============================================================================

/**
 * Payload for creating a new dispatch
 * Maps to create_dispatch_with_stock_check RPC function
 */
export interface CreateDispatchPayload {
  p_dispatch_data: {
    disp_no: string;
    disp_date: string;          // ISO timestamp
    registration: string;
    customer_id: string;
    customer_name: string;
    supervisor_id: string;
    supervisor_name: string;
    note: string;
    source_order_id?: string | null;
    source_order_no?: string | null;
  };
  p_dispatch_items: Array<{
    gr_trl_id: string;          // Lot ID (maps to grnItems_id)
    disp_qty: number;           // Dispatch quantity
  }>;
  p_generate_invoice: boolean;  // Auto-generate invoice
  p_retry_count: number;        // Retry count for idempotency (default 0)
  p_idempotency_key: string;    // Unique key to prevent duplicate submissions
}

/**
 * Payload for updating an existing dispatch
 * Maps to update_dispatch_smart RPC function
 */
export interface UpdateDispatchPayload extends CreateDispatchPayload {
  p_dispatch_id: string;
}

/**
 * Response from create/update dispatch operations
 */
export interface DispatchApiResponse {
  success: boolean;
  dispatch_id?: string;
  dispatch_items?: any[];
  message?: string;
  error?: string;
  invoice_data?: any;
  invoiceGenerated?: boolean;
  invoiceNumber?: string;
  source_order_cleared?: boolean;  // True when dispatch was created from an order and the order was soft-deleted
  source_order_id?: string;        // The order ID that was cleared
}

// ============================================================================
// GRN DETAIL ENTITIES
// ============================================================================

/**
 * GRN header information for item selection
 */
export interface GRNDetailHeader {
  id: string;                  // GRN ID (gr_id)
  gr_no: string;               // GRN number
  date: string;                // ISO timestamp
  customer_name: string;
  customer_id: string;
}

/**
 * GRN item (lot) information for dispatch selection
 */
export interface GRNDetailItem {
  id: string;                  // Lot ID (gr_trl_id)
  item_id: string;             // Item master ID
  item_name: string;
  quantity: number;            // Original GRN quantity
  stock: number;               // Available stock
  package_mark: string;
  rack: string;
  weight: number;
}

/**
 * Complete GRN detail response
 */
export interface GRNDetailResponse {
  success: boolean;
  data?: {
    grn: GRNDetailHeader;
    items: GRNDetailItem[];
  };
  error?: string;
}

// ============================================================================
// AUTOCOMPLETE ENTITIES
// ============================================================================

/**
 * GRN autocomplete search result
 */
export interface GRNAutocompleteItem {
  id: string;                  // GRN ID
  gr_no: string;               // GRN number for display
  date: string;                // Date for display
  customer_name: string;
}

/**
 * Customer autocomplete result (reused from GRN)
 */
export interface CustomerAutocompleteItem {
  id: string;
  name: string;
  address?: string;
}

/**
 * Supervisor/User autocomplete result (reused from GRN)
 */
export interface SupervisorAutocompleteItem {
  id: string;
  name: string;
  role?: string;
}

// ============================================================================
// STOCK VALIDATION
// ============================================================================

/**
 * Available stock check response
 */
export interface StockCheckResponse {
  gr_trl_id: string;
  item_name: string;
  original_qty: number;
  dispatched_qty: number;
  available_stock: number;
}

// ============================================================================
// FORM VALIDATION
// ============================================================================

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// ============================================================================
// UI HELPER TYPES
// ============================================================================

/**
 * Form step configuration
 */
export interface DispatchFormStep {
  number: number;
  label: string;
  path: string;
}

/**
 * Item form data (for Step 2 single item form)
 */
export interface ItemFormData extends Partial<DispatchItemData> {
  unique_id: string;
}

// ============================================================================
// BACKEND RESPONSE TYPES
// ============================================================================

/**
 * Backend dispatch data structure from RPC responses
 * Handles both camelCase and snake_case field variations from backend
 */
export interface BackendDispatchData {
  id: string;
  dispatchId?: string;
  dispNo?: string;
  disp_no?: string;
  dispDate?: string;
  dispatchDate?: string;
  disp_date?: string;
  dispatch_date?: string;
  date?: string;
  customerId?: string;
  customer_id?: string;
  customerName?: string;
  customer_name?: string;
  supervisorId?: string;
  supervisor_id?: string;
  supervisorName?: string;
  supervisor_name?: string;
  registration?: string;
  truck_no?: string;
  note?: string | null;
  notes?: string | null;
  totalItems?: number;
  total_items?: number;
  totalQty?: number;
  total_qty?: number;
  totalWeight?: number;
  total_weight?: number;
  items?: Array<{
    itemId?: string;
    item_id?: string;
    itemName?: string;
    item_name?: string;
    dispQty?: number | string;
    disp_qty?: number | string;
    weight?: number | string;
    grNo?: string;
    gr_no?: string;
    grnItemId?: string;
    grn_item_id?: string;
    packageMark?: string;
    package_mark?: string;
    grnQty?: number | string;
    grn_qty?: number | string;
    rack?: string;
  }>;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

// ============================================================================
// DATABASE ENTITIES (for reference)
// ============================================================================

/**
 * Dispatch table row structure
 */
export interface DispatchEntity {
  id: string;                  // UUID, PK
  disp_no: string;             // varchar(15), UNIQUE
  disp_date: string;           // timestamptz
  registration: string;        // varchar(30)
  customer_id: string;         // UUID, FK
  customer_name: string;       // varchar(100)
  supervisor_id: string;       // UUID, FK
  supervisor_name: string;     // varchar(100)
  note: string;                // varchar(250)
  source_order_id: string | null;
  source_order_no: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Dispatch_trl table row structure
 */
export interface DispatchItemEntity {
  id: string;                  // UUID, PK
  disp_id: string;             // UUID, FK to dispatch
  gr_trl_id: string;           // UUID, FK to goodsreceived_trl (lot reference)
  gr_id: string;               // UUID, auto-populated by RPC
  disp_qty: number;            // integer
  created_at: string;
  updated_at: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DISPATCH_STEPS: DispatchFormStep[] = [
  { number: 1, label: 'Header', path: '/dispatch-form/step1' },
  { number: 2, label: 'Items', path: '/dispatch-form/step2' },
  { number: 3, label: 'Review', path: '/dispatch-form/step3' },
];

export const EMPTY_DISPATCH_HEADER: DispatchHeaderData = {
  disp_no: '',
  disp_date: new Date().toISOString(),
  registration: '',
  customer_id: '',
  customer_name: '',
  customer_address: '',
  customer_city: '',
  customer_mobile: '',
  supervisor_id: '',
  supervisor_name: '',
  note: '',
};

export const EMPTY_DISPATCH_ITEM: ItemFormData = {
  unique_id: '',
  grns_id: '',
  grns_gr_no: '',
  grns_date: '',
  grns_customer_name: '',
  grnItems_id: '',
  grnItems_item_id: '',
  grnItems_item_name: '',
  grnItems_quantity: 0,
  grnItems_stock: 0,
  grnItems_package_mark: '',
  grnItems_rack: '',
  grnItems_weight: 0,
  disp_quantity: 0,
  original_disp_quantity: 0,
};

// ============================================================================
// RECENT DISPATCHED ORDERS (from get_recent_dispatched_orders RPC)
// ============================================================================

/**
 * Item detail for a recently dispatched order
 */
export interface RecentDispatchedOrderItem {
  item_name: string;
  disp_qty: number;
  rack: string | null;
  package_mark: string | null;
  gr_no: string;
  weight: number;
}

/**
 * Single dispatch from the recent dispatched orders RPC
 */
export interface RecentDispatchedOrder {
  dispatch_id: string;
  disp_no: string;
  disp_date: string;
  customer_id: string;
  customer_name: string;
  order_id: string;
  order_no: string;
  item_count: number;
  total_qty: number;
  registration: string | null;
  created_by_name: string;
  items: RecentDispatchedOrderItem[];
}

/**
 * Response from get_recent_dispatched_orders RPC
 */
export interface RecentDispatchedOrdersResponse {
  success: boolean;
  error?: string;
  data?: {
    total_count: number;
    has_more: boolean;
    dispatches: RecentDispatchedOrder[];
  };
}
