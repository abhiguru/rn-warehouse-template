/**
 * Choose an item: a searchable bottom sheet over the items the caller already holds (no
 * server search). Used by the Add button of the Item pricing list, "Copy tiers from another
 * item…" in the rate editor and "Same as another item" on Add item. Like the customer sheet it
 * opens at 90% so the rows do not move after typing (P-28). With no search typed it lists every item.
 */
import React, { useCallback } from 'react';
import { Pressable, Text } from 'react-native';
import { SearchableBottomSheet } from '@/components/common/SearchableBottomSheet';
import { matchesSearch, searchTerms } from '@/features/filters/searchMatch';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';

export interface PickableItem {
  id: string;
  name: string;
  packaging?: string | null;
}

export interface ItemPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: PickableItem) => void;
  items: PickableItem[];
  title: string;
  /** Shown when the sheet has no items to offer at all. */
  emptyText?: string;
}

export const ITEM_PICKER_SNAP_POINTS = ['90%', '95%'];

const makeStyles = (th: ThemeTokens) => ({
  row: { minHeight: 56, justifyContent: 'center' as const, paddingVertical: space.sm, paddingHorizontal: layout.marginCompact },
  name: { ...typography.headline, color: th.text.primary },
  detail: { ...typography.subhead, color: th.text.secondary },
});

export function ItemPickerSheet({ visible, onClose, onSelect, items, title, emptyText }: ItemPickerSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const [lastQuery, setLastQuery] = React.useState('');
  const searchFn = useCallback(async (query: string): Promise<PickableItem[]> => {
    setLastQuery(query.trim());
    const terms = searchTerms(query);
    return terms.length === 0 ? items : items.filter(item => matchesSearch(terms, [item.name]));
  }, [items]);

  const renderItem = useCallback(
    (item: PickableItem, select: (i: PickableItem) => void) => (
      <Pressable
        onPress={() => select(item)}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={[item.name, item.packaging].filter(Boolean).join(', ')}
        testID={`picker-item-${item.id}`}
      >
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        {item.packaging ? <Text style={styles.detail}>{item.packaging}</Text> : null}
      </Pressable>
    ),
    [styles],
  );

  return (
    <SearchableBottomSheet<PickableItem>
      isVisible={visible}
      onClose={onClose}
      onSelect={onSelect}
      title={title}
      placeholder={t('pricing.itemPicker.placeholder')}
      searchFn={searchFn}
      renderItem={renderItem}
      keyExtractor={i => i.id}
      snapPoints={ITEM_PICKER_SNAP_POINTS}
      minQueryLength={0}
      emptyInitialText={emptyText ?? t('pricing.itemPicker.initial')}
      emptySearchText={items.length === 0 ? (emptyText ?? t('pricing.itemPicker.initial')) : t('pricing.itemPicker.empty', { search: lastQuery })}
    />
  );
}

export default ItemPickerSheet;
