// Item Storage Pricing Type Definitions

export type PriceType = 'one_time' | 'monthly';

export interface ItemStoragePrice {
  id: string;
  item_id: string;
  item_name: string;
  customer_id: string | null;
  customer_name: string | null;
  price_type: PriceType;
  unit_price: number;
  weight_min: number;
  weight_max: number;
  labour_rate: number;
  tax_percent: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  created_by: string;
}

export interface ItemPricingFilters {
  price_ids?: string[];
  item_ids?: string[];
  customer_ids?: string[];
  price_type?: PriceType;
  weight_min?: number;
  weight_max?: number;
  effective_from?: string;
  effective_to?: string;
  include_expired?: boolean;
}

export interface ItemPricingListParams {
  p_filters?: ItemPricingFilters;
  p_sort_by?:
    | 'item_name'
    | 'customer_name'
    | 'price_type'
    | 'unit_price'
    | 'weight_min'
    | 'weight_max'
    | 'effective_from'
    | 'effective_to'
    | 'created_at';
  p_sort_order?: 'asc' | 'desc';
  p_limit?: number;
  p_offset?: number;
}

export interface ItemPricingListResponse {
  success: boolean;
  data: ItemStoragePrice[];
  pagination: {
    total_count: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
  message?: string;
  error?: string;
}

export interface CreateItemPricingPayload {
  item_id: string;
  customer_id?: string | null;
  price_type: PriceType;
  unit_price: number;
  weight_min: number;
  weight_max: number;
  labour_rate: number;
  tax_percent: number;
  effective_from: string;
  effective_to?: string | null;
}

export interface UpdateItemPricingPayload {
  price_type?: PriceType;
  unit_price?: number;
  weight_min?: number;
  weight_max?: number;
  labour_rate?: number;
  tax_percent?: number;
  effective_from?: string;
  effective_to?: string | null;
}

export interface ItemPricingMutationResponse {
  success: boolean;
  data?: ItemStoragePrice;
  message: string;
  error?: string;
}

export interface ItemPricingDeleteResponse {
  success: boolean;
  message: string;
  error?: string;
}

// Types for findOrCreateItemStoragePrice
export interface FindOrCreatePricingParams {
  item_id: string;
  customer_id: string;
  weight: number;
  price_type: 'one_time' | 'monthly';
  default_values?: {
    unit_price?: number;
    labour_rate?: number;
    tax_percent?: number;
    weight_min?: number;
    weight_max?: number;
  };
}

export interface FindOrCreatePricingResponse {
  success: boolean;
  data?: ItemStoragePrice & { was_created: boolean };
  message?: string;
  error?: string;
}
