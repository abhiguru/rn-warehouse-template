/**
 * The association's sign-in could not send a code (WH-148): says so, and offers the facility's own SMS sign-in.
 * Shown on the central sign-in screen under the title, in the banner slot of PhoneSignInForm.
 */
import React from 'react';
import { Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

const makeStyles = (t: ThemeTokens) => ({
  strip: {
    marginHorizontal: layout.marginCompact,
    marginVertical: space.sm,
    padding: space.md,
    gap: space.sm,
    backgroundColor: t.status.critical.background,
    borderColor: t.status.critical.border,
    borderWidth: 1,
    borderRadius: radius.button,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  text: { ...typography.subhead, color: t.status.critical.text, flex: 1 },
});

export function CantSendStrip({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  return (
    <View style={styles.strip} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="central-cant-send">
      <View style={styles.row}>
        <Icon name="alert" size={iconSize.sm} color={t.status.critical.text} />
        <Text style={styles.text}>{tr('central.signIn.cantSend')}</Text>
      </View>
      <Button type="secondary" onPress={onPress} accessibilityHint={tr('central.signIn.useFacilityCodeHint')} testID="sign-in-with-facility-sms">
        {tr('central.signIn.useFacilityCode')}
      </Button>
    </View>
  );
}
