/**
 * "Copy tiers from another item…": the items (other than this one) that have a default rate in
 * force today of the type being edited. Opened by the rate editor only, so the rates load (from
 * the session cache when the list already did) when the person asks for it.
 */
import React, { useCallback, useMemo } from 'react';
import { t } from '@/i18n';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { rowsInForce } from '../editModel';
import { useItemRates } from '../useItemRates';
import { ItemPickerSheet, type PickableItem } from './ItemPickerSheet';

export interface CopyTiersSheetProps {
  visible: boolean;
  onClose: () => void;
  itemId: string;
  priceType: PriceType;
  today: string;
  /** The chosen item and its default rows in force today. */
  onPick: (item: PickableItem, rows: ItemStoragePrice[]) => void;
}

export function CopyTiersSheet({ visible, onClose, itemId, priceType, today, onPick }: CopyTiersSheetProps) {
  const { items, rates, status } = useItemRates();
  const inForce = useMemo(() => {
    const byItem = new Map<string, ItemStoragePrice[]>();
    for (const row of rates) {
      if (row.customer_id !== null || row.price_type !== priceType) continue;
      const list = byItem.get(row.item_id);
      if (list) list.push(row);
      else byItem.set(row.item_id, [row]);
    }
    const result = new Map<string, ItemStoragePrice[]>();
    for (const [id, rows] of byItem) {
      const now = rowsInForce(rows, { customerId: null, priceType }, today);
      if (now.length > 0) result.set(id, now);
    }
    return result;
  }, [rates, priceType, today]);
  const offered = useMemo(() => items.filter(i => i.id !== itemId && inForce.has(i.id)), [items, itemId, inForce]);
  const select = useCallback((item: PickableItem) => onPick(item, inForce.get(item.id) ?? []), [inForce, onPick]);
  return (
    <ItemPickerSheet
      visible={visible}
      onClose={onClose}
      onSelect={select}
      items={offered}
      title={t('pricing.edit.copyTitle')}
      emptyText={status === 'ready' ? t('pricing.edit.copyNone') : t('pricing.edit.copyLoading')}
    />
  );
}

export default CopyTiersSheet;
