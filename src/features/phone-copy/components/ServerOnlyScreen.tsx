/**
 * A page that only the server can give (orders, dispatches, invoices; WH-381, Design offline-capture.md 13.1 A). With no
 * connection it draws the stack header (Back and the title) and the "needs a connection" state, and mounts nothing of the page:
 * no request, no kept row, no History or "+" button. On reconnecting the page mounts afresh and loads by itself.
 */
import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import type { ThemeTokens } from '@/theme/tokens';
import { useNeedsConnection } from '../useNeedsConnection';
import { ScreenNeedsConnection } from './ScreenNeedsConnection';

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
});

interface Props {
  title: string;
  testID: string;
  children: React.ReactNode;
}

export const ServerOnlyScreen: React.FC<Props> = ({ title, testID, children }) => {
  const needsConnection = useNeedsConnection();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  if (!needsConnection) return <>{children}</>;
  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerStyle: { backgroundColor: t.surface.header },
          headerTintColor: t.brand.tint,
          headerShadowVisible: false,
          headerTitleAlign: 'center',
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <ScreenNeedsConnection testID={testID} />
    </View>
  );
};
