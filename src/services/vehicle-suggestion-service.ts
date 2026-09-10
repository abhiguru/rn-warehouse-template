/**
 * Vehicle Suggestion Service
 * Fetches popular vehicle registration numbers for autocomplete
 */

import { getSupabaseClient } from '@/config/supabaseConfig';
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';

export interface VehicleSuggestion {
  registration: string;
  usage_count: number;
}

interface VehicleSuggestionsResponse {
  suggestions: VehicleSuggestion[];
}

export interface VehicleSuggestionOptions {
  prefix?: string;
  limit?: number;
  customerId?: string | null;
}

/**
 * Get vehicle registration suggestions based on prefix and optionally customer
 * @param options.prefix - The partial registration number typed by user (can be empty for most popular)
 * @param options.limit - Max suggestions to return (default: 5)
 * @param options.customerId - Customer UUID to prioritize their frequently used vehicles
 * @returns Array of vehicle suggestions sorted by usage count
 */
// M3 Fix: Using executeRPC wrapper
export async function getVehicleSuggestions(
  options: VehicleSuggestionOptions = {}
): Promise<VehicleSuggestion[]> {
  const { prefix = '', limit = 5, customerId = null } = options;

  const result = await executeRPC<VehicleSuggestionsResponse, VehicleSuggestion[]>(
    async () => getSupabaseClient(),
    'get_vehicle_suggestions',
    {
      p_prefix: prefix || null,
      p_limit: limit,
      p_customer_id: customerId || null,
    },
    {
      context: 'VehicleSuggestionService.getVehicleSuggestions',
      errorMessage: 'Failed to fetch vehicle suggestions',
      unwrapNested: false,
      validateSuccess: false,
      transform: (data) => data?.suggestions ?? [],
    }
  );

  return result.success ? (result.data ?? []) : [];
}

/**
 * Get the top suggestion for a given prefix and customer
 * @param prefix - The partial registration number
 * @param customerId - Optional customer UUID for personalized suggestions
 * @returns The most popular matching registration or null
 */
export async function getTopVehicleSuggestion(
  prefix: string = '',
  customerId?: string | null
): Promise<string | null> {
  const suggestions = await getVehicleSuggestions({
    prefix,
    limit: 1,
    customerId,
  });
  return suggestions[0]?.registration ?? null;
}
