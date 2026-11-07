/**
 * "Exempt: no tax charged" on the rate screens (WH-151): shown beside the tax box when the item is marked Exempt (agricultural
 * produce), because the server then charges no tax on its lines whatever the rate's tax %. Nothing is shown for a Taxable item,
 * on a backend before migration 173, or while the treatment cannot be read.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { backendHasFeature } from '@/config/backendFeatures';
import { getItemGstTreatment } from '@/services/gstService';
import { useThemedStyles } from '@/hooks/useTheme';
import { typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    note: { ...typography.footnote, color: t.text.secondary },
  });

export function ExemptNoTaxNote({ itemId }: { itemId: string | null | undefined }) {
  const styles = useThemedStyles(makeStyles);
  const [exempt, setExempt] = useState(false);
  const enabled = backendHasFeature('gstDocuments') && !!itemId;

  useEffect(() => {
    if (!enabled || !itemId) {
      setExempt(false);
      return undefined;
    }
    let current = true;
    void getItemGstTreatment(itemId).then((value) => {
      if (current) setExempt(value === 'exempt_agri');
    });
    return () => {
      current = false;
    };
  }, [enabled, itemId]);

  if (!exempt) return null;
  return <Text style={styles.note} testID="exempt-no-tax">{tr('gst.rates.exemptNoTax')}</Text>;
}
