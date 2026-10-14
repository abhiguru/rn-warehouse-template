/** "How an invoice picks a rate": five numbered lines in a sheet. */
import React from 'react';
import { Text, View } from 'react-native';
import { SheetFrame } from '@/features/filters/components/SheetFrame';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { space, typography, type ThemeTokens } from '@/theme/tokens';

const makeStyles = (th: ThemeTokens) => ({
  list: { gap: space.md, paddingBottom: space.md },
  line: { flexDirection: 'row' as const, gap: space.md },
  number: { ...typography.body, width: space.xl, color: th.text.secondary },
  text: { ...typography.body, flex: 1, color: th.text.primary },
});

export function HowInvoiceSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const lines = ['l1', 'l2', 'l3', 'l4', 'l5'] as const;
  return (
    <SheetFrame visible={visible} title={t('pricing.how.title')} onClose={onClose} closeLabel={t('pricing.how.close')}>
      <View style={styles.list}>
        {lines.map((key, index) => (
          <View key={key} style={styles.line}>
            <Text style={styles.number}>{localizeDigits(`${index + 1}.`)}</Text>
            <Text style={styles.text}>{t(`pricing.how.${key}`)}</Text>
          </View>
        ))}
      </View>
    </SheetFrame>
  );
}
