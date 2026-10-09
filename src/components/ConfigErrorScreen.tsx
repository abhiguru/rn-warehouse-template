/**
 * Configuration Error Screen
 *
 * Full-screen state (docs/STYLE_GUIDE.md §13.9) shown when configuration
 * cannot be fetched from the API. Keeps protected app content unavailable
 * until configuration can be loaded.
 */

import React, { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { StateActionButton } from '@/components/ErrorBoundary';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ConfigErrorScreen');

export interface ConfigErrorScreenProps {
  /** Technical cause. Shown in development builds only; release builds log it. */
  error?: string;
  onRetry?: () => void;
  /**
   * Open the server selection screen. The selected server's credentials stay
   * untouched until the operator confirms a change there.
   */
  onChangeServer?: () => void;
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
  devStrip: {
    alignSelf: 'stretch' as const,
    flexDirection: 'row' as const,
    gap: space.sm,
    backgroundColor: t.status.negative.background,
    borderColor: t.status.negative.border,
    borderWidth: 1,
    borderRadius: radius.button,
    padding: space.md,
    marginBottom: space.xxl,
  },
  devContent: { flex: 1 },
  devLabel: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.status.negative.text },
  devText: {
    ...typography.footnote,
    color: t.status.negative.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  actions: { alignSelf: 'stretch' as const, gap: space.sm },
  footer: {
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
    paddingVertical: space.lg,
    paddingHorizontal: layout.marginCompact,
  },
  footerText: { ...typography.footnote, color: t.text.secondary, textAlign: 'center' as const },
});

const ConfigErrorScreen: React.FC<ConfigErrorScreenProps> = ({
  error,
  onRetry,
  onChangeServer,
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      if (onRetry) {
        await onRetry();
      }
    } catch (err) {
      logger.error('Retry failed:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.column}>
          <MaterialCommunityIcons
            name="cloud-off-outline"
            size={iconSize.hero}
            color={t.status.negative.text}
            style={styles.icon}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />

          <Text style={styles.title} accessibilityRole="header">
            Couldn&apos;t load app settings
          </Text>

          <Text style={styles.message}>
            The app couldn&apos;t get its settings from the warehouse server, so your data stays hidden
            for now. Check your connection and try again.
          </Text>

          {__DEV__ && error ? (
            <View style={styles.devStrip}>
              <MaterialCommunityIcons name="alert-circle" size={iconSize.md} color={t.status.negative.text} />
              <View style={styles.devContent}>
                <Text style={styles.devLabel}>Details (development builds only)</Text>
                <Text style={styles.devText} selectable>
                  {error}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.actions}>
            <StateActionButton
              fullWidth
              icon="refresh"
              label="Try again"
              loading={isRetrying}
              loadingLabel="Trying again"
              onPress={handleRetry}
              accessibilityLabel={isRetrying ? 'Retrying' : 'Retry loading configuration'}
            />

            {/* Opens the selection screen only; nothing is signed out until the
                operator confirms a change there. */}
            {onChangeServer && (
              <StateActionButton
                fullWidth
                variant="secondary"
                icon="server"
                label="Change server"
                onPress={onChangeServer}
                disabled={isRetrying}
                accessibilityLabel="Change warehouse server"
              />
            )}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>If this keeps happening, contact your facility.</Text>
      </View>
    </SafeAreaView>
  );
};

export default ConfigErrorScreen;
