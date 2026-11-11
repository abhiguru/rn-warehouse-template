/** The Home strip "Add your GST details so bills print correctly." with Add (administrators, until details are saved; WH-151). */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { useThemedStyles } from '@/hooks/useTheme';
import { layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { useGstNotSaved } from './useGstSaved';

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    strip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: layout.marginCompact,
      paddingVertical: space.sm,
      backgroundColor: t.status.informative.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.status.informative.border,
    },
    text: { ...typography.subhead, color: t.text.primary, flex: 1 },
  });

export function GstStrip() {
  const styles = useThemedStyles(makeStyles);
  const show = useGstNotSaved();
  if (!show) return null;
  return (
    <View style={styles.strip} testID="gst-strip">
      <Text style={styles.text}>{tr('gst.strip.text')}</Text>
      <Button type="secondary" onPress={() => router.push('/gst-details')} testID="gst-strip-add">
        {tr('gst.strip.add')}
      </Button>
    </View>
  );
}
