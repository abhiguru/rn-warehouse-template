/**
 * Customer Types
 *
 * Consolidated type definitions for customer management feature.
 * Used across customer list, create/edit forms, and detail views.
 */

// =============================================================================
// ENTITY TYPES
// =============================================================================

/**
 * Full customer entity (matches database schema)
 */
export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email?: string;
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
  gst?: string;
  pan?: string;
  contact_name?: string;
  contact_mobile?: string;
  contact_email?: string;
  document_urls?: string[];
  image_urls?: string[];
  active: boolean;
  created_at: string;
  updated_at?: string;
}

/**
 * Customer list item (lightweight for list views)
 */
export interface CustomerListItem {
  id: string;
  name: string;
  mobile: string;
  city?: string;
  email?: string;
  address?: string;
  active: boolean;
}

// =============================================================================
// FORM TYPES
// =============================================================================

/**
 * Form data structure for create/edit customer
 * Organized by step for multi-step wizard
 */
export interface CustomerFormData {
  // Step 1: Basic Info
  name: string;
  mobile: string;
  email: string;

  // Step 2: Address & Tax Details
  city: string;
  state: string;
  pincode: string;
  address: string;
  gst: string;
  pan: string;
  contact_name: string;
  contact_mobile: string;
  contact_email: string;

  // Step 3: Documents & Images
  document_urls: string[];
  document_images: CustomerDocumentImage[];
  image_urls: string[];
  customer_images: CustomerImage[];
}

/**
 * Document image for upload
 */
export interface CustomerDocumentImage {
  uri: string;
  type?: string;
  name?: string;
  uploaded?: boolean;
}

/**
 * Customer image for upload (max 10 images)
 */
export interface CustomerImage {
  uri: string;
  type?: string;
  name?: string;
  uploaded?: boolean;
}

/**
 * Initial form data (empty values)
 */
export const INITIAL_CUSTOMER_FORM_DATA: CustomerFormData = {
  // Step 1
  name: '',
  mobile: '',
  email: '',
  // Step 2
  city: '',
  state: '',
  pincode: '',
  address: '',
  gst: '',
  pan: '',
  contact_name: '',
  contact_mobile: '',
  contact_email: '',
  // Step 3
  document_urls: [],
  document_images: [],
  image_urls: [],
  customer_images: [],
};

// =============================================================================
// VALIDATION ERROR TYPES
// =============================================================================

/**
 * Validation errors by field
 */
export interface CustomerValidationErrors {
  // Step 1
  name?: string;
  mobile?: string;
  email?: string;
  // Step 2
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
  gst?: string;
  pan?: string;
  contact_name?: string;
  contact_mobile?: string;
  contact_email?: string;
  // Step 3
  document_urls?: string;
  image_urls?: string;
}

// =============================================================================
// SERVICE RESPONSE TYPES
// =============================================================================

/**
 * Generic service response
 */
export interface CustomerServiceResponse<T = Customer> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

/**
 * Customer list response with pagination
 */
export interface CustomerListResponse {
  success: boolean;
  message: string;
  data: CustomerListItem[];
  pagination?: CustomerPagination;
  error?: string;
}

/**
 * Pagination info
 */
export interface CustomerPagination {
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

// =============================================================================
// FILTER TYPES
// =============================================================================

/**
 * Filter options for customer list
 */
export interface CustomerFilters {
  search?: string;
  active?: boolean | null; // null = all, true = active only, false = inactive only
  city?: string;
  sortBy?: CustomerSortField;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Sortable fields
 */
export type CustomerSortField = 'name' | 'created_at' | 'city' | 'mobile';

/**
 * Default filter values
 */
export const DEFAULT_CUSTOMER_FILTERS: CustomerFilters = {
  search: '',
  active: null, // Show all customers (active + inactive) so admins can reactivate
  city: undefined,
  sortBy: 'name',
  sortOrder: 'asc',
};

// =============================================================================
// RPC REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Create customer RPC request parameters
 */
export interface CreateCustomerParams {
  p_name: string;
  p_mobile: string;
  p_email?: string;
  p_city?: string;
  p_state?: string;
  p_pincode?: string;
  p_address?: string;
  p_gst_number?: string;
  p_pan_number?: string;
  p_contact_person?: string;
  p_contact_mobile?: string;
  p_contact_email?: string;
  p_image_urls?: string[];
  p_document_urls?: string[];
}

/**
 * Update customer RPC request parameters
 */
export interface UpdateCustomerParams extends CreateCustomerParams {
  p_customer_id: string;
}

/**
 * Search customers RPC request parameters
 */
export interface SearchCustomersParams {
  p_search_query: string;
  p_limit?: number;
}

/**
 * Create/Update customer RPC response
 */
export interface CustomerRpcResponse {
  success: boolean;
  message: string;
  customer_id?: string;
  customer_data?: Customer;
}

// =============================================================================
// UI STATE TYPES
// =============================================================================

/**
 * Customer form mode
 */
export type CustomerFormMode = 'create' | 'edit';

/**
 * Customer form step numbers
 */
export type CustomerFormStep = 1 | 2 | 3;

/**
 * Customer form state (for Redux slice)
 */
export interface CustomerFormState {
  mode: CustomerFormMode;
  customer_id: string | null;
  current_step: CustomerFormStep;
  formData: CustomerFormData;
  validationErrors: CustomerValidationErrors;
  isLoading: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
}

/**
 * Initial Redux state
 */
export const INITIAL_CUSTOMER_FORM_STATE: CustomerFormState = {
  mode: 'create',
  customer_id: null,
  current_step: 1,
  formData: INITIAL_CUSTOMER_FORM_DATA,
  validationErrors: {},
  isLoading: false,
  isSubmitting: false,
  isDirty: false,
};
