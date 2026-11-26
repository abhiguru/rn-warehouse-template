/**
 * Overview tab of the item page: what the item is (name, packaging, description) and the ways to deactivate or
 * activate it and to delete it. A section appears only when it has a value.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { useThemedStyles } from '@/hooks/useTheme';
import type { Item } from '@/types/item.types';
import { layout, space, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { ItemGstTreatment } from '@/features/gst/ItemGstTreatment';
import { NeedsConnectionLine } from '@/features/phone-copy/components/NeedsConnectionLine';
import { needsConnectionLabel, useNeedsConnectionV3 } from '@/features/phone-copy/useNeedsConnection';

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
  // Activate, Deactivate and Delete need the server (WH-348, Design 2.5): disabled offline, one line says why.
  const needsConnection = useNeedsConnectionV3();
  const toggleLabel = tr(item.active ? 'items.list.deactivateItem' : 'items.page.activate');

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
      {/* WH-151: GST on storage (administrators and supervisors, backends with migration 173). */}
      <View style={styles.gst}>
        <ItemGstTreatment itemId={item.id} />
      </View>
      <View style={styles.footer}>
        {needsConnection ? (
          <NeedsConnectionLine testID="item-details-actions-needs-connection" text={tr('components.offlineRead.needsConnection')} />
        ) : null}
        <Button
          type="tertiary"
          variant={item.active ? 'negative' : 'tint'}
          onPress={onToggleActive}
          loading={busy}
          disabled={busy || needsConnection}
          testID={item.active ? 'item-details-deactivate' : 'item-details-activate'}
          accessibilityLabel={needsConnection ? needsConnectionLabel(toggleLabel) : undefined}
        >
          {toggleLabel}
        </Button>
        <Button
          type="tertiary"
          variant="negative"
          leftIcon="trash-can-outline"
          onPress={onDelete}
          disabled={busy || needsConnection}
          testID="item-details-delete"
          accessibilityLabel={needsConnection ? needsConnectionLabel(tr('items.delete.deleteItem')) : undefined}
        >
          {tr('items.delete.deleteItem')}
        </Button>
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  scroll: { flex: 1 },
  cells: { backgroundColor: t.surface.card },
  gst: { paddingTop: space.xl },
  footer: { paddingHorizontal: layout.marginCompact, paddingTop: space.xl, alignItems: 'flex-start' as const, gap: space.sm },
});

export default ItemOverviewTab;
