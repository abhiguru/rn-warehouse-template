import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { readVia } from '@/features/phone-copy/readRoute';
import { readItemSearch } from '@/features/phone-copy/reads/pickers';

export interface ItemSearchResult {
  id: string;
  name: string;
  packaging?: string;
}

// Shared by both GRN item-entry layouts.
export async function searchItems(query: string): Promise<ItemSearchResult[]> {
  const generation = getSessionGeneration();
  try {
    const copy = await readVia('stage1', q => readItemSearch(q, query, true));
    let data: { items?: ItemSearchResult[] } | null;
    if (copy) {
      if (generation !== getSessionGeneration()) return [];
      data = copy.value as unknown as { items?: ItemSearchResult[] };
    } else {
      const client = await getAuthenticatedClient();
      if (generation !== getSessionGeneration()) return [];
      const answer = await client.rpc('search_items_autocomplete', {
        p_search_query: query,
        p_active_only: true,
        p_limit: 20,
      });
      if (generation !== getSessionGeneration() || answer.error) return [];
      data = answer.data;
    }
    return (data?.items || []).map((item: ItemSearchResult) => ({
      id: item.id,
      name: item.name,
      packaging: item.packaging || '',
    }));
  } catch {
    return [];
  }
}
