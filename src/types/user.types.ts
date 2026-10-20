export interface UserProfile {
  id: string;
  auth_user_id: string;
  name: string;
  email: string;
  mobile?: string;
  role: 'admin' | 'supervisor' | 'staff' | 'customer';
  supervisor: boolean; // Legacy field for UI compatibility
  active: boolean;
  created_at: string;
  updated_at: string;
  assignedCustomers?: CustomerAssignment[];
  /**
   * Whether `assignedCustomers` was read: `failed` means the lookup did not
   * answer (the list is empty but says nothing), `loaded` that it is the answer.
   */
  assignedCustomersStatus?: 'loaded' | 'failed';
  assignedCustomerIds?: string[];
  phoneNumber?: string;
}

export interface CustomerAssignment {
  id: string;
  name: string;
  mobile?: string;
  city?: string;
  active: boolean;
}

/** The customers the signed-in person may see, and whether they could be read. */
export interface AccessibleCustomers {
  status: 'loaded' | 'failed';
  customers: CustomerAssignment[];
}

export interface UserFormData {
  name: string;
  email: string;
  mobile?: string;
  supervisor: boolean;
  active: boolean;
  assignedCustomerIds: string[];
}

export interface UserServiceResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  /**
   * On a failed account deletion: `refused` when the server answered and kept
   * the account, `unknown` when no answer arrived (the deletion may have run).
   */
  outcome?: 'refused' | 'unknown';
}

export interface SearchCustomerResult {
  value: string; // customer ID
  label: string; // customer name
  detail?: string; // additional info like mobile/city
}

export interface UserEditFormProps {
  userId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

// =============================================================================
// ADMIN USER MANAGEMENT TYPES
// =============================================================================

export type UserRole = 'admin' | 'supervisor' | 'staff' | 'customer';

export interface UserListItem {
  id: string;
  auth_user_id: string;
  name: string;
  display_name: string | null;
  mobile: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
  assigned_customers_count: number;
  /**
   * A connection such as the FAS sync, not a person (backend `user_profiles.is_service_account`).
   * Users lists it apart from people, and its role and status cannot be changed in the app.
   */
  is_service_account?: boolean;
  /** Access request: 'pending' (not reviewed), 'rejected', or null (approved or never asked). */
  enrollment_status?: 'pending' | 'rejected' | null;
  /** The person deleted their own account (backend migration 113). Their mobile is blank. */
  is_deleted?: boolean;
  deleted_at?: string | null;
}

export interface UserDetailsCustomer {
  customer_id: string;
  customer_name: string;
  customer_mobile: string | null;
  customer_city: string | null;
  assigned_at: string;
  assigned_by_name: string | null;
  /** False when the business is deactivated. Not known counts as active. */
  customer_active?: boolean;
}

export interface UserDetails extends UserListItem {
  assigned_customers: UserDetailsCustomer[];
}

export interface UserFilters {
  search_query?: string;
  roles?: UserRole[];
  active?: boolean | null;
}

export interface UserListPagination {
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
  /** Rows including deleted accounts, which the list shows after the live ones. `total_count` counts live accounts only. */
  total_with_deleted?: number;
}

export interface UserListResponse {
  users: UserListItem[];
  pagination: UserListPagination;
}

export interface UserDetailsResponse {
  user: UserListItem;
  assigned_customers: UserDetailsCustomer[];
}

export interface UpdateUserRoleResponse {
  success: boolean;
  user_id: string;
  old_role: UserRole;
  new_role: UserRole;
  /** Customer assignments removed because the new role is not Customer. */
  removed_customer_count: number;
}

export interface UpdateUserStatusResponse {
  success: boolean;
  user_id: string;
  active: boolean;
}
