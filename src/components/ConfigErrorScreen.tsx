/**
 * Configuration Error Screen
 *
 * Full-screen state (docs/STYLE_GUIDE.md §13.9) shown when configuration
 * cannot be fetched from the API. Keeps protected app content unavailable
 * until configuration can be loaded.
 */

import React, { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { StateActionButton } from '@/components/ErrorBoundary';
import { createLogger } from '@/utils/logger';
import { t as tr } from '@/i18n';
import { showAlert } from '@/utils/alert';

const logger = createLogger('ConfigErrorScreen');

export interface ConfigErrorScreenProps {
  /** Technical cause. Shown in development builds only; release builds log it. */
  error?: string;
  onRetry?: () => void | Promise<unknown>;
  /**
   * Open the server selection screen. The selected server's credentials stay
   * untouched until the operator confirms a change there.
   */
  onChangeServer?: () => void;
  /** Central login: the second button leads to My facilities, not to server selection. */
  toFacilities?: boolean;
  /** The facility answered that its server is being updated: its own title and text, no technical detail, no footer. */
  upgrading?: boolean;
  /** The phone was away past the offline limit (WH-351): its own title, text and "Try again" screen-reader label. */
  offlineTooLong?: boolean;
  /** With `offlineTooLong`: this phone holds unsent entries, so the text also says they are kept. */
  unsentKept?: boolean;
  /** The phone's secure store stayed unreadable (WH-362): its own title, text and label, "Try again" only, no connection hint. */
  storeUnreadable?: boolean;
  /**
   * With `storeUnreadable` (WH-363): after repeated failed tries the person may sign in again. Confirmed in a dialog
   * here; the caller removes the saved sign-in and the phone copy. Not passed until the tries are enough.
   */
  onSignInAgain?: () => void | Promise<unknown>;
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
  toFacilities = false,
  upgrading = false,
  offlineTooLong = false,
  unsentKept = false,
  storeUnreadable = false,
  onSignInAgain,
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

  const copy = () => {
    if (upgrading) return { title: tr('components.upgrading.title'), message: tr('components.upgrading.message') };
    if (storeUnreadable) {
      const base = tr('components.configError.storeUnreadableMessage');
      return {
        title: tr('components.configError.storeUnreadableTitle'),
        message: signInAgainOffered ? `${base} ${tr('components.configError.storeUnreadableSignInHint')}` : base,
      };
    }
    if (!offlineTooLong) return { title: tr('components.configError.title'), message: tr('components.configError.message') };
    const message = tr('components.configError.offlineTooLongMessage');
    return {
      title: tr('components.configError.offlineTooLongTitle'),
      message: unsentKept ? `${message} ${tr('components.configError.offlineTooLongKept')}` : message,
    };
  };
  const signInAgainOffered = storeUnreadable && Boolean(onSignInAgain);
  const { title, message } = copy();
  const retryLabel = (() => {
    if (storeUnreadable) return tr('components.configError.storeUnreadableRetryLabel');
    return offlineTooLong ? tr('components.configError.offlineTooLongRetryLabel') : tr('components.configError.retryLabel');
  })();
  // An unreadable store is not mended by leaving the facility: "Try again" is the only action (Design 12.1).
  const showSecondAction = Boolean(onChangeServer) && !storeUnreadable;

  // The confirmation (STYLE_GUIDE 14.3): Cancel changes nothing. The sentence about unsent entries only when some are.
  const confirmSignInAgain = () => {
    const base = tr('components.configError.signInAgainMessage');
    showAlert(
      tr('components.configError.signInAgainTitle'),
      unsentKept ? `${base} ${tr('components.configError.signInAgainKeepsUnsent')}` : base,
      [
        { text: tr('common.cancel'), style: 'cancel' },
        { text: tr('components.configError.signInAgain'), onPress: () => void Promise.resolve(onSignInAgain?.()).catch(err => logger.error('Sign in again failed:', err)) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.column}>
          <MaterialCommunityIcons
            name={upgrading ? 'wrench-outline' : 'cloud-off-outline'}
            size={iconSize.hero}
            color={t.status.negative.text}
            style={styles.icon}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />

          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>

          <Text style={styles.message}>{message}</Text>

          {__DEV__ && error && !upgrading ? (
            <View style={styles.devStrip}>
              <MaterialCommunityIcons name="alert-circle" size={iconSize.md} color={t.status.negative.text} />
              <View style={styles.devContent}>
                <Text style={styles.devLabel}>{tr('components.devDetails')}</Text>
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
              label={tr('common.retry')}
              loading={isRetrying}
              loadingLabel={tr('components.configError.tryingAgain')}
              onPress={() => void handleRetry()}
              accessibilityLabel={isRetrying ? tr('components.configError.retrying') : retryLabel}
            />

            {signInAgainOffered && (
              <StateActionButton
                fullWidth
                variant="secondary"
                label={tr('components.configError.signInAgain')}
                onPress={confirmSignInAgain}
                disabled={isRetrying}
              />
            )}

            {/* Opens the selection screen only; nothing is signed out until the
                operator confirms a change there. */}
            {showSecondAction && onChangeServer && (
              <StateActionButton
                fullWidth
                variant="secondary"
                icon={toFacilities ? 'arrow-left' : 'server'}
                label={toFacilities ? tr('nav.screens.myFacilities') : tr('components.configError.changeServer')}
                onPress={onChangeServer}
                disabled={isRetrying}
                accessibilityLabel={toFacilities ? tr('components.configError.backToFacilitiesLabel') : tr('components.configError.changeServerLabel')}
              />
            )}
          </View>
        </View>
      </ScrollView>

      {upgrading ? null : (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{tr('components.configError.footer')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

export default ConfigErrorScreen;
