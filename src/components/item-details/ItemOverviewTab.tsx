/**
 * Overview tab of the item page: what the item is (name, packaging, description) and the ways to deactivate or
 * activate it and to delete it. A section appears only when it has a value; a deactivated item says so.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusTag } from '@/components/ui/StatusTag';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { useThemedStyles } from '@/hooks/useTheme';
import type { Item } from '@/types/item.types';
import { layout, space, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

type Row = { label: string; value: string | undefined | null };

interface ItemOverviewTabProps {
  item: Item;
  busy: boolean;
  onToggleActive: () => void;
  onDelete: () => void;
}

export function ItemOverviewTab({ item, busy, onToggleActive, onDelete }: ItemOverviewTabProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const rows: Row[] = [
    { label: tr('items.form.itemName'), value: item.name },
    { label: tr('common.packaging'), value: item.packaging },
    { label: tr('items.form.description'), value: item.description },
  ].filter(row => !!row.value?.trim());

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
      showsVerticalScrollIndicator={false}
    >
      {!item.active && (
        <View style={styles.status}>
          <StatusTag status="neutral" label={tr('common.deactivated')} />
        </View>
      )}
      {rows.length > 0 && (
        <View>
          <SectionHeader title={tr('items.page.details')} />
          <View style={styles.cells}>
            {rows.map((row, index) => (
              <KeyValueCell key={row.label} keyLabel={row.label} value={row.value as string} showDivider={index < rows.length - 1} />
            ))}
          </View>
        </View>
      )}
      <View style={styles.footer}>
        <Button type="tertiary" variant={item.active ? 'negative' : 'tint'} onPress={onToggleActive} disabled={busy}>
          {tr(item.active ? 'items.list.deactivateItem' : 'items.page.activate')}
        </Button>
        <Button type="tertiary" variant="negative" leftIcon="trash-can-outline" onPress={onDelete} disabled={busy}>
          {tr('items.delete.deleteItem')}
        </Button>
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  scroll: { flex: 1 },
  status: { paddingHorizontal: layout.marginCompact, paddingTop: space.md, alignItems: 'flex-start' as const },
  cells: { backgroundColor: t.surface.card, paddingHorizontal: layout.marginCompact },
  footer: { paddingHorizontal: layout.marginCompact, paddingTop: space.xl, alignItems: 'flex-start' as const, gap: space.sm },
});

export default ItemOverviewTab;
