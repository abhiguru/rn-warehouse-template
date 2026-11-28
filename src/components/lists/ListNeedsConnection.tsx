/**
 * What a top-level list that only the server can give draws while the phone is offline (WH-381; Design
 * offline-capture.md 13.1 A): its title row (title and Profile and settings, and a switch under it if the screen has one),
 * and the "needs a connection" state. No search, filters, rows, "+" or fetch: the list's own component is not mounted, so it
 * asks nothing and keeps nothing, and it loads by itself when it is mounted again on reconnecting.
 */
import React from 'react';
import { View } from 'react-native';
import { ListTitleRow } from '@/features/filters/components/ListTitleRow';
import { ScreenNeedsConnection } from '@/features/phone-copy/components/ScreenNeedsConnection';
import { useNeedsConnection } from '@/features/phone-copy/useNeedsConnection';
import { useThemedStyles } from '@/hooks/useTheme';
import type { ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
});

interface Props {
  title: string;
  testID: string;
  /** Under the title row, for example the Orders | Queue switch. */
  subHeader?: React.ReactNode;
}

export const ListNeedsConnection: React.FC<Props> = ({ title, testID, subHeader }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <ListTitleRow title={title}>{subHeader}</ListTitleRow>
      <ScreenNeedsConnection testID={testID} />
    </View>
  );
};

/**
 * The seam between the lists and the phone's connection: true when the list must show `ListNeedsConnection` instead of
 * reading anything. The one place that decides it for Orders, the order queue, Dispatch and Invoices. Those services are
 * server-only (no read of the phone copy, WH-381), so the signal is the copy engine's offline flag with the feature on.
 */
export const useListNeedsConnection = (): boolean => useNeedsConnection();
