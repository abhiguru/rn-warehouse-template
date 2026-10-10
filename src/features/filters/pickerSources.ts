/**
 * Where the Customer and Item pickers get their options.
 *
 * Warehouse roles search every customer. A customer account only ever sees
 * the customers assigned to it, taken from its profile, so it never calls the
 * staff-only customer search.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { searchService } from '@/services/search-service';
import type { FilterContext, PickedOption, PickerSource } from './types';

const INITIAL_OPTIONS = 30;

async function ownCustomers(ctx: FilterContext): Promise<PickedOption[]> {
  const known = ctx.assignedCustomers.filter(customer => customer.label);
  if (known.length === ctx.assignedCustomers.length) return known;
  // The profile carried ids only: read the names (row-level security keeps this to own customers).
  const client = await getAuthenticatedClient();
  const { data } = await client
    .from('customers')
    .select('id, name, city')
    .in('id', ctx.assignedCustomers.map(customer => customer.id))
    .order('name');
  return (data ?? []).map(row => ({ id: row.id, label: row.name, detail: row.city ?? undefined }));
}

export const customerSource: PickerSource = {
  async initial(ctx) {
    if (!ctx.isWarehouseRole) return ownCustomers(ctx);
    const client = await getAuthenticatedClient();
    const { data } = await client.from('customers').select('id, name, city').order('name').limit(INITIAL_OPTIONS);
    return (data ?? []).map(row => ({ id: row.id, label: row.name, detail: row.city ?? undefined }));
  },
  async search(query, ctx) {
    if (!ctx.isWarehouseRole) {
      const needle = query.trim().toLowerCase();
      return (await ownCustomers(ctx)).filter(customer => customer.label.toLowerCase().includes(needle));
    }
    const results = await searchService.searchCustomers(query);
    return results.map(result => ({ id: result.value, label: result.label, detail: result.city ?? result.detail }));
  },
};

export const itemSource: PickerSource = {
  async initial() {
    const client = await getAuthenticatedClient();
    const { data } = await client.from('items').select('id, name, packaging').order('name').limit(INITIAL_OPTIONS);
    return (data ?? []).map(row => ({ id: row.id, label: row.name, detail: row.packaging ?? undefined }));
  },
  async search(query) {
    const results = await searchService.searchGRNItems(query);
    return results.map(result => ({ id: result.value, label: result.label, detail: result.detail }));
  },
};
