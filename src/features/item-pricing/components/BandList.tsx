/** The weight bands of a rate: "Weight each" and the rent, with labour only when the bands differ in it. */
import React from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { space, typography, fontWeight, type ThemeTokens } from '@/theme/tokens';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { bandText, money } from '../rateText';

export interface BandListProps {
  bands: ItemStoragePrice[];
  priceType: PriceType;
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
  first: { flex: 1 },
  cell: { minWidth: 80, textAlign: 'right' as const },
  headText: { ...typography.footnote, color: th.text.secondary },
  text: { ...typography.body, color: th.text.primary, fontVariant: TABULAR },
  strong: { fontWeight: fontWeight.semibold },
});

export function BandList({ bands, priceType }: BandListProps) {
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
      {bands.map(b => (
        <View key={b.id} style={styles.row}>
          <Text style={[styles.text, styles.first]}>{bandText(b.weight_min, b.weight_max)}</Text>
          <Text style={[styles.text, styles.strong, styles.cell]}>{money(b.unit_price)}</Text>
          {showLabour ? <Text style={[styles.text, styles.cell]}>{money(b.labour_rate)}</Text> : null}
          {showTax ? <Text style={[styles.text, styles.cell]}>{`${localizeDigits(String(b.tax_percent))}%`}</Text> : null}
        </View>
      ))}
    </View>
  );
}
