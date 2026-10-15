/**
 * The "Rate" section of Add item: the new item gets the facility's standard rate (with a summary
 * of its tiers) or the rates of another item (picked from the items that have a default rate in
 * force today). The choice is sent as `p_rate_from_item` (backend migration 85, create_item).
 *
 * The standard rate is read for the summary; the items and rates are read only while "Same as
 * another item" is chosen.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ChoiceChips } from '@/features/filters/components/ChoiceChips';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { rowsInForce } from '../editModel';
import { tierSummary } from '../standardRate';
import { todayDay } from '../rateText';
import { useItemRates } from '../useItemRates';
import { useStandardRate } from '../useStandardRate';
import { ItemPickerSheet, type PickableItem } from './ItemPickerSheet';

export type RateChoice = 'standard' | 'item';

export interface ItemRateChoiceProps {
  choice: RateChoice;
  onChoice: (choice: RateChoice) => void;
  /** The item whose rates are copied (choice 'item'). */
  source: PickableItem | null;
  onSource: (item: PickableItem) => void;
  /** Shown under the row when "Same as another item" is chosen and no item was picked. */
  error?: string;
}

const makeStyles = (th: ThemeTokens) => ({
  wrap: { gap: space.xs },
  label: { ...typography.footnote, color: th.text.secondary },
  summary: { ...typography.subhead, color: th.text.secondary },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.field,
    backgroundColor: th.surface.field,
    borderColor: th.border.field,
  },
  rowDisabled: { opacity: 0.5 },
  rowError: { borderWidth: 2, borderColor: th.status.negative.border },
  rowText: { ...typography.body, color: th.text.primary, flexShrink: 1 },
  rowPlaceholder: { ...typography.body, color: th.text.placeholder, flexShrink: 1 },
  error: { ...typography.footnote, color: th.status.negative.text },
});

/** "Same as another item": the row that opens the picker, over the items with a default rate in force today. */
function SourceRow({ source, onSource, error }: Pick<ItemRateChoiceProps, 'source' | 'onSource' | 'error'>) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const { items, rates, status, refresh } = useItemRates();
  const offline = useIsOffline();
  const [open, setOpen] = useState(false);
  const offered = useMemo(() => {
    const day = todayDay();
    return items.filter(item => {
      const own = rates.filter(r => r.item_id === item.id);
      return (['monthly', 'one_time'] as const).some(priceType => rowsInForce(own, { customerId: null, priceType }, day).length > 0);
    });
  }, [items, rates]);

  // Offline with nothing loaded there is nothing to pick from, and nothing would ever arrive.
  const blocked = offline && status !== 'ready';
  return (
    <>
      <Pressable
        style={[styles.row, !!error && styles.rowError, blocked && styles.rowDisabled]}
        onPress={() => setOpen(true)}
        disabled={blocked}
        accessibilityState={{ disabled: blocked }}
        accessibilityRole="button"
        accessibilityLabel={source ? t('items.form.rateItemSelected', { item: source.name }) : t('items.form.ratePickItem')}
        testID="rate-source-row"
      >
        <Text style={source ? styles.rowText : styles.rowPlaceholder} numberOfLines={2}>{source ? source.name : t('items.form.ratePickItem')}</Text>
        <Icon name="chevron-right" size={iconSize.md} color={th.icon.secondary} />
      </Pressable>
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite" testID="rate-source-error">{error}</Text> : null}
      <ItemPickerSheet
        visible={open}
        onClose={() => setOpen(false)}
        onSelect={item => { setOpen(false); onSource(item); }}
        items={offered}
        title={t('items.form.ratePickItem')}
        emptyText={status === 'ready' ? t('items.form.rateNoItems') : t('pricing.edit.copyLoading')}
        loadError={status === 'error'}
        onRetry={() => { void refresh(); }}
      />
    </>
  );
}

export function ItemRateChoice({ choice, onChoice, source, onSource, error }: ItemRateChoiceProps) {
  const styles = useThemedStyles(makeStyles);
  const standard = useStandardRate();
  const tiers = standard.rate?.tiers ?? [];
  const summary =
    standard.status !== 'ready' ? null : tiers.length > 0 ? tierSummary(tiers) : t('items.form.rateNoStandard', { tools: t('common.toolsAndSettings'), screen: t('settings.features.standardRate') });
  return (
    <View style={styles.wrap} testID="item-rate-choice">
      <Text style={styles.label}>{t('items.form.rateTitle')}</Text>
      <ChoiceChips<RateChoice>
        options={[
          { value: 'standard', label: t('items.form.rateStandard') },
          { value: 'item', label: t('items.form.rateSame') },
        ]}
        value={choice}
        onChange={onChoice}
        accessibilityLabel={t('items.form.rateTitle')}
      />
      {choice === 'standard' ? (
        summary ? <Text style={styles.summary} testID="rate-standard-summary">{summary}</Text> : null
      ) : (
        <SourceRow source={source} onSource={onSource} error={error} />
      )}
    </View>
  );
}

export default ItemRateChoice;
