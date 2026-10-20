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
  /** A second line under the name (the copy sheet shows the item's band count and rent range). */
  detail?: string;
}

export interface ItemPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: PickableItem) => void;
  items: PickableItem[];
  title: string;
  /** Shown when the sheet has no items to offer at all. */
  emptyText?: string;
  /** The items could not be loaded: the sheet says so and offers Try again (onRetry). */
  loadError?: boolean;
  onRetry?: () => void;
}

export const ITEM_PICKER_SNAP_POINTS = ['90%', '95%'];

const makeStyles = (th: ThemeTokens) => ({
  row: { minHeight: 56, justifyContent: 'center' as const, paddingVertical: space.sm, paddingHorizontal: layout.marginCompact },
  name: { ...typography.headline, color: th.text.primary },
  detail: { ...typography.subhead, color: th.text.secondary },
});

export function ItemPickerSheet({ visible, onClose, onSelect, items, title, emptyText, loadError, onRetry }: ItemPickerSheetProps) {
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
        accessibilityLabel={[item.name, item.packaging, item.detail].filter(Boolean).join(', ')}
        testID={`picker-item-${item.id}`}
      >
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        {item.packaging ? <Text style={styles.detail}>{item.packaging}</Text> : null}
        {item.detail ? <Text style={styles.detail} testID={`picker-item-${item.id}-detail`}>{item.detail}</Text> : null}
      </Pressable>
    ),
    [styles],
  );

  const nothingText = loadError ? t('pricing.itemPicker.loadError') : (emptyText ?? t('pricing.itemPicker.initial'));
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
      emptyInitialText={nothingText}
      emptySearchText={items.length === 0 ? nothingText : t('pricing.itemPicker.empty', { search: lastQuery })}
      emptyAction={loadError && onRetry ? { label: t('pricing.list.tryAgain'), onPress: onRetry } : undefined}
    />
  );
}

export default ItemPickerSheet;
