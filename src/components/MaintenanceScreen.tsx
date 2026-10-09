/**
 * Maintenance Mode Screen
 *
 * Full-screen state (docs/STYLE_GUIDE.md §13.9) shown when the app is in
 * maintenance mode, with support contact links when configured.
 */

import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSupport, useEnvironment } from '@/hooks/useConfig';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { formatDate, toDate } from '@/utils/formatters';

function formatBuildDate(value: string): string {
  return toDate(value) ? `\nBuilt ${formatDate(value)}` : '';
}

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.xxxl,
  },
  column: { width: '100%' as const, maxWidth: layout.maxFormWidth, alignItems: 'center' as const },
  icon: { marginBottom: space.lg },
  title: { ...typography.title2, color: t.text.primary, textAlign: 'center' as const, marginBottom: space.sm },
  message: { ...typography.body, color: t.text.secondary, textAlign: 'center' as const, marginBottom: space.xxl },
  sectionHeader: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    alignSelf: 'stretch' as const,
    marginBottom: space.sm,
    paddingHorizontal: space.lg,
  },
  card: {
    alignSelf: 'stretch' as const,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
    backgroundColor: t.surface.card,
  },
  rowPressed: { backgroundColor: t.surface.cardPressed },
  rowDivider: { borderTopWidth: 1, borderTopColor: t.border.divider },
  rowText: { ...typography.body, color: t.brand.tint, flex: 1 },
  env: { ...typography.caption1, color: t.text.secondary, textAlign: 'center' as const, marginTop: space.xxl },
  footer: {
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
    paddingVertical: space.lg,
    paddingHorizontal: layout.marginCompact,
  },
  footerText: { ...typography.footnote, color: t.text.secondary, textAlign: 'center' as const },
});

const MaintenanceScreen: React.FC = () => {
  const support = useSupport();
  const environment = useEnvironment();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const handleEmailPress = () => {
    if (support?.email) {
      Linking.openURL(`mailto:${support.email}`);
    }
  };

  const handlePhonePress = () => {
    if (support?.phone) {
      Linking.openURL(`tel:${support.phone}`);
    }
  };

  const hasSupport = Boolean(support && (support.email || support.phone));

  return (
    <SafeAreaView style={styles.screen}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.column}>
          <MaterialCommunityIcons
            name="wrench-outline"
            size={iconSize.hero}
            color={t.status.informative.text}
            style={styles.icon}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />

          <Text style={styles.title} accessibilityRole="header">
            The app is under maintenance
          </Text>

          <Text style={styles.message}>
            We&apos;re making scheduled improvements. The app will be back shortly. Your saved
            data is safe.
          </Text>

          {hasSupport && (
            <>
              <Text style={styles.sectionHeader} accessibilityRole="header">
                Need help?
              </Text>
              <View style={styles.card}>
                {support?.email ? (
                  <Pressable
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={handleEmailPress}
                    accessibilityRole="link"
                    accessibilityLabel={`Email support at ${support.email}`}
                    accessibilityHint="Opens your email app"
                  >
                    <MaterialCommunityIcons name="email-outline" size={iconSize.md} color={t.brand.tint} />
                    <Text style={styles.rowText}>{support.email}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
                  </Pressable>
                ) : null}

                {support?.phone ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.row,
                      support.email ? styles.rowDivider : null,
                      pressed && styles.rowPressed,
                    ]}
                    onPress={handlePhonePress}
                    accessibilityRole="link"
                    accessibilityLabel={`Call support at ${support.phone}`}
                    accessibilityHint="Opens your phone app"
                  >
                    <MaterialCommunityIcons name="phone-outline" size={iconSize.md} color={t.brand.tint} />
                    <Text style={styles.rowText}>{support.phone}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
                  </Pressable>
                ) : null}
              </View>
            </>
          )}

          {environment ? (
            <Text style={styles.env}>
              {`${environment.name} · Version ${environment.version}`}
              {environment.buildDate ? formatBuildDate(environment.buildDate) : ''}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Thank you for your patience.</Text>
      </View>
    </SafeAreaView>
  );
};

export default MaintenanceScreen;
