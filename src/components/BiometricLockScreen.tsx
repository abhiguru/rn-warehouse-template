/**
 * Biometric Lock Screen
 *
 * Shown when app launches and biometric auth is enabled.
 * Prompts user to authenticate with Face ID/Touch ID/Fingerprint.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme, { colors, darkColors } from '@/theme';
import { PrimaryButton, GhostButton } from '@/components/ui/Button';
import { useBiometricAuth, BiometricType } from '@/hooks/useBiometricAuth';
import { triggerSuccess, triggerError } from '@/hooks/useHaptics';

// Local logo asset
const localLogo = require('../../assets/logo.jpeg');

interface BiometricLockScreenProps {
  onSuccess: () => void;
  onUsePhoneLogin: () => void;
}

/**
 * Get icon name for biometric type
 */
function getBiometricIcon(type: BiometricType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'face':
      return 'scan-outline';
    case 'fingerprint':
      return 'finger-print-outline';
    default:
      return 'lock-closed-outline';
  }
}

export function BiometricLockScreen({
  onSuccess,
  onUsePhoneLogin,
}: BiometricLockScreenProps) {
  const insets = useSafeAreaInsets();

  // Dark mode support
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

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
        console.error('[BiometricLockScreen] Auth error:', error);
      }
      triggerError();
    } finally {
      setIsAuthenticating(false);
    }
  };

  const biometricIcon = getBiometricIcon(biometricType);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image source={localLogo} style={styles.logo} resizeMode="contain" />
        </View>

        {/* Biometric Icon */}
        <View style={[styles.iconContainer, { backgroundColor: themeColors.orange[50] }]}>
          <View style={[styles.iconCircle, { borderColor: themeColors.primary }]}>
            <Ionicons name={biometricIcon} size={64} color={themeColors.primary} />
          </View>
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: themeColors.fiori.text.primary }]}>Welcome Back</Text>
        <Text style={[styles.subtitle, { color: themeColors.fiori.text.secondary }]}>
          Use {biometricLabel} to unlock the app
        </Text>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          <PrimaryButton
            onPress={handleBiometricAuth}
            disabled={isAuthenticating}
            loading={isAuthenticating}
            size="large"
            fullWidth
          >
            {`Unlock with ${biometricLabel}`}
          </PrimaryButton>

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: themeColors.gray[200] }]} />
            <Text style={[styles.dividerText, { color: themeColors.fiori.text.secondary }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: themeColors.gray[200] }]} />
          </View>

          <GhostButton onPress={onUsePhoneLogin} size="medium" fullWidth>
            Use Phone Number
          </GhostButton>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    marginBottom: 32,
  },
  logo: {
    width: 120,
    height: 120,
  },
  iconContainer: {
    marginBottom: 24,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 17,
    textAlign: 'center',
    marginBottom: 48,
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
  },
});

export default BiometricLockScreen;
