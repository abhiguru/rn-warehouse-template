/**
 * A tab or section that only the server can give, with the phone offline (WH-381; Design offline-capture.md 13.1 B and 13.2):
 * one line with the cloud icon and "This needs a connection. It will load when you reconnect." No rows, no "Try again".
 */
import React from 'react';
import { View } from 'react-native';
import { t as tr } from '@/i18n';
import { useThemedStyles } from '@/hooks/useTheme';
import { layout, space } from '@/theme/tokens';
import { NeedsConnectionLine } from './NeedsConnectionLine';

const makeStyles = () => ({
  box: { paddingHorizontal: layout.marginCompact, paddingVertical: space.md },
});

export const SectionNeedsConnection: React.FC<{ testID: string }> = ({ testID }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.box}>
      <NeedsConnectionLine testID={testID} text={tr('components.offlineRead.screenNeedsConnection')} icon />
    </View>
  );
};
