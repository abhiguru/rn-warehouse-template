/**
 * The "GRN | Find goods" switch under the GRN tab's title (WH-300, Design 3.1): a full-width segmented control, as the
 * Orders | Queue switch.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SegmentedControl } from '@/components/ui/RadioButton';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { layout, space } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { setGrnView, type GrnView } from './findGoodsSession';

const makeStyles = (tokens: ThemeTokens) => ({
  bar: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    backgroundColor: tokens.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.border.separator,
  },
  // The bar supplies the page margin, so drop the control's own form-cell padding.
  control: { paddingHorizontal: 0, paddingVertical: 0 },
});

/** Built when drawn, so the labels follow the app's language. */
const options = (): { value: GrnView; label: string }[] => [
  { value: 'grn', label: t('nav.grnView.grn') },
  { value: 'find-goods', label: t('nav.grnView.findGoods') },
];

export function GrnViewSwitch({ view }: { view: GrnView }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.bar}>
      <SegmentedControl
        testID="grn-view-switch"
        segmentRole="tab"
        value={view}
        onValueChange={value => setGrnView(value === 'find-goods' ? 'find-goods' : 'grn')}
        options={options()}
        style={styles.control}
      />
    </View>
  );
}
