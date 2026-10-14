import type { ItemStoragePrice } from '@/types/item-pricing.types';

/** Fixture F1 of the pricing spec (Review North names). Today in the examples is 2026-10-14. */
export const TODAY = '2026-10-14';

export const ITEMS = [
  { id: 'ajwain-bold', name: 'Ajwain Bold', packaging: 'Bag' },
  { id: 'ajwain-a', name: 'Ajwain Grade A', packaging: 'Bag' },
  { id: 'cumin', name: 'Review Cumin Bold', packaging: 'Bag' },
  { id: 'garlic', name: 'Review Garlic Desi', packaging: 'Bag' },
  { id: 'onion', name: 'Review Onion Red', packaging: 'Bag' },
  { id: 'onion-small', name: 'Review Onion Red Small', packaging: 'Bag' },
  { id: 'potato', name: 'Review Potato Seed', packaging: 'Bag' },
];

let n = 0;
export function row(over: Partial<ItemStoragePrice> & { item_id: string; weight_min: number; weight_max: number; unit_price: number; effective_from: string }): ItemStoragePrice {
  n += 1;
  const item = ITEMS.find(i => i.id === over.item_id);
  return {
    id: `p${n}`,
    item_name: item?.name ?? over.item_id,
    customer_id: null,
    customer_name: null,
    price_type: 'monthly',
    labour_rate: 2.5,
    tax_percent: 5,
    effective_to: null,
    created_at: '2025-01-01T00:00:00Z',
    created_by: 'u1',
    ...over,
  };
}

export const ORCHARD_B = { customer_id: 'orchard-b', customer_name: 'Review Orchard B' };

export const F1: ItemStoragePrice[] = [
  row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 10, labour_rate: 3, effective_from: '2025-01-01', effective_to: '2026-03-31' }),
  row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 11, labour_rate: 3, effective_from: '2026-04-01' }),
  row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 12, labour_rate: 3, effective_from: '2027-01-01' }),
  row({ item_id: 'garlic', weight_min: 0, weight_max: 40, unit_price: 6, effective_from: '2025-01-01' }),
  row({ item_id: 'garlic', weight_min: 41, weight_max: 100, unit_price: 9.5, effective_from: '2025-01-01' }),
  row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3.5, labour_rate: 1.5, effective_from: '2025-01-01' }),
  row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3, labour_rate: 1.5, effective_from: '2026-01-01', ...ORCHARD_B }),
  row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 4, labour_rate: 2, tax_percent: 0, effective_from: '2025-01-01' }),
  row({ item_id: 'ajwain-bold', weight_min: 0, weight_max: 100, unit_price: 10, effective_from: '2025-01-01' }),
  row({ item_id: 'ajwain-a', weight_min: 0, weight_max: 100, unit_price: 9.5, effective_from: '2025-01-01' }),
];
