/**
 * Biometric Authentication Hook
 *
 * Provides biometric authentication (Face ID, Touch ID, Fingerprint)
 * for secure app unlock on subsequent launches.
 *
 * Usage:
 *   const {
 *     isBiometricAvailable,
 *     biometricType,
 *     isBiometricEnabled,
 *     enableBiometric,
 *     disableBiometric,
 *     authenticateWithBiometric,
 *   } = useBiometricAuth();
 */

import { useState, useEffect, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

// SecureStore keys
const BIOMETRIC_ENABLED_KEY = 'biometric_auth_enabled';
const BIOMETRIC_ENROLLED_KEY = 'biometric_enrolled_timestamp';

// Biometric type labels for UI
export type BiometricType = 'face' | 'fingerprint' | 'iris' | 'none';

export interface BiometricAuthState {
  /** Whether device hardware supports biometrics */
  isHardwareAvailable: boolean;
  /** Whether biometrics are enrolled on device (user has set up Face ID/Touch ID) */
  isBiometricEnrolled: boolean;
  /** Combined check: hardware available AND enrolled */
  isBiometricAvailable: boolean;
  /** Type of biometric available */
  biometricType: BiometricType;
  /** Human-readable label for biometric type */
  biometricLabel: string;
  /** Whether user has enabled biometric auth in our app */
  isBiometricEnabled: boolean;
  /** Loading state while checking availability */
  isLoading: boolean;
}

export interface BiometricAuthActions {
  /** Enable biometric auth for this app */
  enableBiometric: () => Promise<boolean>;
  /** Disable biometric auth for this app */
  disableBiometric: () => Promise<void>;
  /** Prompt user for biometric authentication */
  authenticateWithBiometric: (promptMessage?: string) => Promise<boolean>;
  /** Check current biometric status (refresh state) */
  checkBiometricStatus: () => Promise<void>;
  /** Prompt user to enroll biometric after login */
  promptBiometricEnrollment: () => Promise<boolean>;
}

export type UseBiometricAuthReturn = BiometricAuthState & BiometricAuthActions;

/**
 * Get human-readable label for biometric type
 */
function getBiometricLabel(type: BiometricType): string {
  switch (type) {
    case 'face':
      return Platform.OS === 'ios' ? 'Face ID' : 'Face Recognition';
    case 'fingerprint':
      return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
    case 'iris':
      return 'Iris Scan';
    default:
      return 'Biometric';
  }
}

/**
 * Convert expo-local-authentication type to our BiometricType
 */
function convertAuthType(types: LocalAuthentication.AuthenticationType[]): BiometricType {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'face';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'fingerprint';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'iris';
  }
  return 'none';
}

/**
 * Hook for biometric authentication
 */
export function useBiometricAuth(): UseBiometricAuthReturn {
  const [state, setState] = useState<BiometricAuthState>({
    isHardwareAvailable: false,
    isBiometricEnrolled: false,
    isBiometricAvailable: false,
    biometricType: 'none',
    biometricLabel: 'Biometric',
    isBiometricEnabled: false,
    isLoading: true,
  });

  /**
   * Check biometric availability and user preference
   */
  const checkBiometricStatus = useCallback(async () => {
    try {
      // Check hardware availability
      const hasHardware = await LocalAuthentication.hasHardwareAsync();

      // Check if biometrics are enrolled
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      // Get supported authentication types
      const authTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const biometricType = convertAuthType(authTypes);
      const biometricLabel = getBiometricLabel(biometricType);

      // Check if user has enabled biometric in our app
      const enabledValue = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      const isBiometricEnabled = enabledValue === 'true';

      setState({
        isHardwareAvailable: hasHardware,
        isBiometricEnrolled: isEnrolled,
        isBiometricAvailable: hasHardware && isEnrolled,
        biometricType,
        biometricLabel,
        isBiometricEnabled,
        isLoading: false,
      });
    } catch (error) {
      if (__DEV__) {
        console.error('[BiometricAuth] Error checking status:', error);
      }
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Check status on mount
  useEffect(() => {
    checkBiometricStatus();
  }, [checkBiometricStatus]);

  /**
   * Enable biometric auth for this app
   * Requires successful biometric authentication first
   */
  const enableBiometric = useCallback(async (): Promise<boolean> => {
    try {
      if (!state.isBiometricAvailable) {
        Alert.alert(
          'Biometric Not Available',
          `${state.biometricLabel} is not available on this device. Please set it up in your device settings first.`
        );
        return false;
      }

      // Verify biometric before enabling
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Authenticate to enable ${state.biometricLabel}`,
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
        fallbackLabel: '',
      });

      if (result.success) {
        await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
        await SecureStore.setItemAsync(BIOMETRIC_ENROLLED_KEY, Date.now().toString());
        setState((prev) => ({ ...prev, isBiometricEnabled: true }));
        return true;
      }

      return false;
    } catch (error) {
      if (__DEV__) {
        console.error('[BiometricAuth] Error enabling biometric:', error);
      }
      return false;
    }
  }, [state.isBiometricAvailable, state.biometricLabel]);

  /**
   * Disable biometric auth for this app
   */
  const disableBiometric = useCallback(async (): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
      await SecureStore.deleteItemAsync(BIOMETRIC_ENROLLED_KEY);
      setState((prev) => ({ ...prev, isBiometricEnabled: false }));
    } catch (error) {
      if (__DEV__) {
        console.error('[BiometricAuth] Error disabling biometric:', error);
      }
    }
  }, []);

  /**
   * Authenticate user with biometric
   */
  const authenticateWithBiometric = useCallback(
    async (promptMessage?: string): Promise<boolean> => {
      try {
        if (!state.isBiometricAvailable) {
          return false;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: promptMessage || `Unlock with ${state.biometricLabel}`,
          cancelLabel: 'Use Phone Login',
          disableDeviceFallback: false, // Allow passcode fallback on iOS
          fallbackLabel: 'Use Passcode',
        });

        return result.success;
      } catch (error) {
        if (__DEV__) {
          console.error('[BiometricAuth] Authentication error:', error);
        }
        return false;
      }
    },
    [state.isBiometricAvailable, state.biometricLabel]
  );

  /**
   * Prompt user to enroll biometric after successful login
   * Returns true if user enabled biometric, false otherwise
   */
  const promptBiometricEnrollment = useCallback(async (): Promise<boolean> => {
    // Don't prompt if:
    // - Biometric not available
    // - Already enabled
    // - Loading
    if (!state.isBiometricAvailable || state.isBiometricEnabled || state.isLoading) {
      return false;
    }

    // Check if we've already asked recently (within 7 days)
    const enrolledTimestamp = await SecureStore.getItemAsync(BIOMETRIC_ENROLLED_KEY);
    if (enrolledTimestamp) {
      const enrolledDate = parseInt(enrolledTimestamp, 10);
      const daysSinceEnrolled = (Date.now() - enrolledDate) / (1000 * 60 * 60 * 24);
      if (daysSinceEnrolled < 7) {
        return false; // Don't ask again within 7 days
      }
    }

    return new Promise((resolve) => {
      Alert.alert(
        `Enable ${state.biometricLabel}?`,
        `Would you like to use ${state.biometricLabel} to quickly unlock the app next time?`,
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: async () => {
              // Store timestamp so we don't ask again for 7 days
              await SecureStore.setItemAsync(BIOMETRIC_ENROLLED_KEY, Date.now().toString());
              resolve(false);
            },
          },
          {
            text: 'Enable',
            style: 'default',
            onPress: async () => {
              const enabled = await enableBiometric();
              resolve(enabled);
            },
          },
        ]
      );
    });
  }, [
    state.isBiometricAvailable,
    state.isBiometricEnabled,
    state.isLoading,
    state.biometricLabel,
    enableBiometric,
  ]);

  return {
    ...state,
    enableBiometric,
    disableBiometric,
    authenticateWithBiometric,
    checkBiometricStatus,
    promptBiometricEnrollment,
  };
}

// ============================================================================
// Standalone functions for use outside React components
// ============================================================================

/**
 * Check if biometric auth is enabled (for use in auth initialization)
 */
export async function isBiometricAuthEnabled(): Promise<boolean> {
  try {
    const enabledValue = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return enabledValue === 'true';
  } catch {
    return false;
  }
}

/**
 * Check if device supports biometric auth
 */
export async function checkBiometricSupport(): Promise<{
  isAvailable: boolean;
  biometricType: BiometricType;
  biometricLabel: string;
}> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const authTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const biometricType = convertAuthType(authTypes);
    const biometricLabel = getBiometricLabel(biometricType);

    return {
      isAvailable: hasHardware && isEnrolled,
      biometricType,
      biometricLabel,
    };
  } catch {
    return {
      isAvailable: false,
      biometricType: 'none',
      biometricLabel: 'Biometric',
    };
  }
}

/**
 * Authenticate with biometric (standalone function)
 */
export async function authenticateBiometric(promptMessage?: string): Promise<boolean> {
  try {
    const { isAvailable, biometricLabel } = await checkBiometricSupport();
    if (!isAvailable) {
      return false;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || `Unlock with ${biometricLabel}`,
      cancelLabel: 'Use Phone Login',
      disableDeviceFallback: false,
      fallbackLabel: 'Use Passcode',
    });

    return result.success;
  } catch {
    return false;
  }
}

export default useBiometricAuth;
