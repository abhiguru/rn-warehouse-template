/** The weight bands of a rate: "Weight each" and the rent, with labour only when the bands differ in it. */
import React from 'react';
import { Text, View } from 'react-native';
import { StatusTag } from '@/components/ui/StatusTag';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { space, typography, fontWeight, type ThemeTokens } from '@/theme/tokens';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { bandText, money } from '../rateText';
import type { TierTag } from '../standardRate';

/** What a band row shows: a rate in force, or a rate set for one GRN only. */
export type BandRow = Pick<ItemStoragePrice, 'id' | 'weight_min' | 'weight_max' | 'unit_price' | 'labour_rate' | 'tax_percent'>;

export interface BandListProps {
  bands: BandRow[];
  priceType: PriceType;
  /** One tag per band ('Standard' or 'This item'), or none. Only a default monthly rate is tagged. */
  tags?: TierTag[] | null;
}

const TABULAR = ['tabular-nums' as const];

const makeStyles = (th: ThemeTokens) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: th.border.divider,
  },
  head: { borderBottomColor: th.border.separator },
  first: { flex: 1, gap: space.xxs },
  cell: { minWidth: 80, textAlign: 'right' as const },
  headText: { ...typography.footnote, color: th.text.secondary },
  text: { ...typography.body, color: th.text.primary, fontVariant: TABULAR },
  strong: { fontWeight: fontWeight.semibold },
});

/** 'Standard' (the tier equals one of the standard rate) or 'This item'. */
export function TierTagView({ tag, testID }: { tag: TierTag; testID?: string }) {
  return (
    <StatusTag
      status={tag === 'standard' ? 'informative' : 'neutral'}
      icon={null}
      label={tag === 'standard' ? t('pricing.standard.tagStandard') : t('pricing.standard.tagThisItem')}
      testID={testID}
    />
  );
}

export function BandList({ bands, priceType, tags }: BandListProps) {
  const styles = useThemedStyles(makeStyles);
  const showLabour = new Set(bands.map(b => b.labour_rate)).size > 1;
  const showTax = new Set(bands.map(b => b.tax_percent)).size > 1;
  return (
    <View testID="band-list">
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.headText, styles.first]}>{t('pricing.band.weightEach')}</Text>
        <Text style={[styles.headText, styles.cell]}>{priceType === 'one_time' ? t('pricing.band.rentOnce') : t('pricing.band.rentMonthly')}</Text>
        {showLabour ? <Text style={[styles.headText, styles.cell]}>{t('pricing.item.labour')}</Text> : null}
        {showTax ? <Text style={[styles.headText, styles.cell]}>{t('pricing.item.tax')}</Text> : null}
      </View>
      {bands.map((b, i) => (
        <View key={b.id} style={styles.row}>
          <View style={styles.first}>
            <Text style={styles.text}>{bandText(b.weight_min, b.weight_max)}</Text>
            {tags?.[i] ? <TierTagView tag={tags[i]} testID={`band-tag-${i}`} /> : null}
          </View>
          <Text style={[styles.text, styles.strong, styles.cell]}>{money(b.unit_price)}</Text>
          {showLabour ? <Text style={[styles.text, styles.cell]}>{money(b.labour_rate)}</Text> : null}
          {showTax ? <Text style={[styles.text, styles.cell]}>{`${localizeDigits(String(b.tax_percent))}%`}</Text> : null}
        </View>
      ))}
    </View>
  );
}
