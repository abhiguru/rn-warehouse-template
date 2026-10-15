/** "Rates for this GRN only" on the GRN details screen (backend migration 86): band and figures per item, and a tag once the GRN is invoiced. */
import React from 'react';
import { Text, View } from 'react-native';
import { SectionHeader, useOverviewStyles } from '@/components/common/overview-tab';
import { StatusTag } from '@/components/ui';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import type { RpcGrnRate } from '@/types/rpc-canonical.types';
import { figuresText } from './GrnRatesSection';

const makeStyles = (th: ThemeTokens) => ({
  row: { gap: space.xs, paddingVertical: space.sm },
  name: { ...typography.headline, color: th.text.primary },
  figures: { ...typography.subhead, color: th.text.secondary },
});

export function GrnOnlyRates({ rates }: { rates: RpcGrnRate[] }) {
  const styles = useThemedStyles(makeStyles);
  const overview = useOverviewStyles();
  return (
    <>
      <SectionHeader title={t('grn.details.ratesTitle')} />
      <View style={overview.chipsCard} testID="grn-only-rates">
        {rates.map(rate => (
          <View key={rate.id} style={styles.row}>
            <Text style={styles.name}>{rate.item_name}</Text>
            <Text style={styles.figures}>{figuresText(rate, rate.price_type === 'one_time')}</Text>
            {rate.archived ? <StatusTag status="neutral" label={t('grn.details.ratesArchived')} /> : null}
          </View>
        ))}
      </View>
    </>
  );
}

export default GrnOnlyRates;
