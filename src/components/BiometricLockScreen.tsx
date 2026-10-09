/**
 * Biometric Lock Screen
 *
 * Shown when app launches and biometric auth is enabled.
 * Prompts user to authenticate with Face ID/Touch ID/Fingerprint.
 * Full-screen state per docs/STYLE_GUIDE.md §13.9.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { BrandMark } from '@/components/BrandMark';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useBiometricAuth, BiometricType } from '@/hooks/useBiometricAuth';
import { triggerSuccess, triggerError } from '@/hooks/useHaptics';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { createLogger } from '@/utils/logger';

const logger = createLogger('BiometricLockScreen');

const APP_NAME = process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager';
const ICON_CIRCLE = 96;

interface BiometricLockScreenProps {
  onSuccess: () => void;
  onUsePhoneLogin: () => void;
}

/**
 * Get icon name for biometric type
 */
function getBiometricIcon(type: BiometricType): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (type) {
    case 'face':
      return 'face-recognition';
    case 'fingerprint':
      return 'fingerprint';
    default:
      return 'lock-outline';
  }
}

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  loading: { flex: 1, backgroundColor: t.background.base, justifyContent: 'center' as const, alignItems: 'center' as const },
  content: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: layout.marginCompact,
  },
  column: { width: '100%' as const, maxWidth: layout.maxFormWidth, alignItems: 'center' as const },
  brand: { marginBottom: space.xxl },
  iconCircle: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: space.xxl,
  },
  title: { ...typography.title2, color: t.text.primary, textAlign: 'center' as const, marginBottom: space.sm },
  subtitle: { ...typography.body, color: t.text.secondary, textAlign: 'center' as const, marginBottom: space.huge },
  buttons: { width: '100%' as const, gap: space.lg },
  divider: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: t.border.divider },
  dividerText: { ...typography.footnote, color: t.text.secondary },
});

export function BiometricLockScreen({
  onSuccess,
  onUsePhoneLogin,
}: BiometricLockScreenProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const {
    biometricType,
    biometricLabel,
    authenticateWithBiometric,
    isLoading,
  } = useBiometricAuth();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);

  // Auto-prompt for biometric on mount
  useEffect(() => {
    if (!isLoading && !hasAttempted) {
      handleBiometricAuth();
    }
  }, [isLoading]);

  const handleBiometricAuth = async () => {
    if (isAuthenticating) return;

    setIsAuthenticating(true);
    setHasAttempted(true);

    try {
      const success = await authenticateWithBiometric();

      if (success) {
        triggerSuccess();
        onSuccess();
      } else {
        triggerError();
      }
    } catch (error) {
      if (__DEV__) {
        logger.error('Auth error:', error);
      }
      triggerError();
    } finally {
      setIsAuthenticating(false);
    }
  };

  const biometricIcon = getBiometricIcon(biometricType);

  if (isLoading) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
        <ActivityIndicator size="large" color={t.brand.tint} accessibilityLabel="Loading" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <View style={styles.content}>
        <View style={styles.column}>
          <View style={styles.brand}>
            <BrandMark label={APP_NAME} />
          </View>

          <View style={styles.iconCircle} accessibilityElementsHidden importantForAccessibility="no">
            <MaterialCommunityIcons name={biometricIcon} size={iconSize.hero} color={t.brand.tint} />
          </View>

          <Text style={styles.title} accessibilityRole="header">
            Welcome back
          </Text>
          <Text style={styles.subtitle}>Use {biometricLabel} to unlock the app.</Text>

          <View style={styles.buttons}>
            <Button
              onPress={handleBiometricAuth}
              loading={isAuthenticating}
              loadingText="Unlocking"
              size="fullWidth"
            >
              {`Unlock with ${biometricLabel}`}
            </Button>

            <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no">
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Button type="tertiary" size="fullWidth" onPress={onUsePhoneLogin}>
              Sign in with mobile number
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}

export default BiometricLockScreen;
