/**
 * A dispatch or invoice form opened with no connection (WH-381; Design offline-capture.md 13.1 A): nothing is drawn but its
 * header and the needs-a-connection state, so no field is offered that could not be sent. A form that was already open when
 * the connection dropped is not touched: it keeps what was typed and its last button says why it waits (13.1 B). Once the
 * connection is back the form is drawn, and a later drop leaves it as it is.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { useThemedStyles } from '@/hooks/useTheme';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { StyleSheet } from 'react-native';
import { useNeedsConnection } from '../useNeedsConnection';
import { ScreenNeedsConnection } from './ScreenNeedsConnection';

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingBottom: space.sm,
    paddingHorizontal: layout.marginCompact,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  title: { ...typography.headline, color: t.text.primary, flexShrink: 1 },
});

interface OfflineFormGateProps {
  title: string;
  testID: string;
  children: React.ReactNode;
}

export function OfflineFormGate({ title, testID, children }: OfflineFormGateProps) {
  const needsConnection = useNeedsConnection();
  const [openedOffline, setOpenedOffline] = useState(needsConnection);
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  // Back online: the form is drawn from now on, whatever the connection does later.
  if (openedOffline && !needsConnection) setOpenedOffline(false);
  if (!(openedOffline && needsConnection)) return <>{children}</>;
  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <HeaderBackButton />
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <ScreenNeedsConnection testID={testID} />
    </View>
  );
}
