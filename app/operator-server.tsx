/**
 * "Change warehouse server": the server screen as a route.
 *
 * Opened from Settings (signed in) it has a header with Back and the title, shows the
 * server in use and leaves the language to Settings. Opened from the sign-in screen
 * (signed out) it keeps the component's own title and language switch. Reached with
 * nothing to go back to, it is the plain component.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OperatorServerSelection } from '@/components/OperatorServerSelection';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export default function OperatorServerScreen() {
  const signedIn = useAppSelector(state => !!state.auth.userProfile);
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();

  if (!router.canGoBack()) return <OperatorServerSelection />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={tokens.statusBarStyle} />
      <View style={styles.navigationBar}>
        <HeaderBackButton style={styles.navBackButton} />
        {signedIn ? (
          <Text style={styles.navTitle} accessibilityRole="header">
            {t('auth.server.change')}
          </Text>
        ) : (
          // Signed out the screen below carries the title: no blank heading for a screen reader.
          <View style={styles.navPlaceholder} />
        )}
        <View style={styles.navPlaceholder} />
      </View>
      <OperatorServerSelection current={signedIn ? getActiveOperatorServer() : null} hideLanguage={signedIn} underHeader />
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  navigationBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  navBackButton: {
    minWidth: 80,
  },
  navTitle: {
    ...typography.headline,
    color: t.text.primary,
    flexShrink: 1,
    textAlign: 'center' as const,
  },
  navPlaceholder: {
    width: 80,
  },
});
