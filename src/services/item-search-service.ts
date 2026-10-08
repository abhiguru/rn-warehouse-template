import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';

export interface ItemSearchResult {
  id: string;
  name: string;
  packaging?: string;
}

// Shared by both GRN item-entry layouts.
export async function searchItems(query: string): Promise<ItemSearchResult[]> {
  const generation = getSessionGeneration();
  try {
    const client = await getAuthenticatedClient();
    if (generation !== getSessionGeneration()) return [];
    const { data, error } = await client.rpc('search_items_autocomplete', {
      p_search_query: query,
      p_active_only: true,
      p_limit: 20,
    });
    if (generation !== getSessionGeneration() || error) return [];
    return (data?.items || []).map((item: ItemSearchResult) => ({
      id: item.id,
      name: item.name,
      packaging: item.packaging || '',
    }));
  } catch {
    return [];
  }
}
