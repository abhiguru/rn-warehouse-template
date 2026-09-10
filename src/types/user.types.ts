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
}

export interface UserDetailsCustomer {
  customer_id: string;
  customer_name: string;
  customer_mobile: string | null;
  customer_city: string | null;
  assigned_at: string;
  assigned_by_name: string | null;
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
}

export interface UpdateUserStatusResponse {
  success: boolean;
  user_id: string;
  active: boolean;
}
