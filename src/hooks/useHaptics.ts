/**
 * Haptic Feedback Hook
 *
 * Provides consistent haptic feedback across the app.
 * Uses expo-haptics for cross-platform tactile feedback.
 *
 * Usage:
 *   const { lightTap, success, error, warning } = useHaptics();
 *   <Button onPress={() => { lightTap(); doAction(); }} />
 *
 * Or use the standalone functions:
 *   import { triggerLightTap, triggerSuccess } from '@/hooks/useHaptics';
 */

import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// ============================================================================
// Standalone Functions (for use outside React components)
// ============================================================================

/**
 * Light tap - use for button presses, list item taps
 */
export const triggerLightTap = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics not available on device
  }
};

/**
 * Medium tap - use for significant actions, toggles
 */
export const triggerMediumTap = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // Haptics not available on device
  }
};

/**
 * Heavy tap - use for destructive actions, confirmations
 */
export const triggerHeavyTap = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {
    // Haptics not available on device
  }
};

/**
 * Success - use after successful form submission, save
 */
export const triggerSuccess = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics not available on device
  }
};

/**
 * Warning - use for validation warnings, caution states
 */
export const triggerWarning = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Haptics not available on device
  }
};

/**
 * Error - use for validation errors, failed actions
 */
export const triggerError = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // Haptics not available on device
  }
};

/**
 * Selection changed - use for picker changes, segment controls
 */
export const triggerSelection = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.selectionAsync();
  } catch {
    // Haptics not available on device
  }
};

// ============================================================================
// React Hook (for use in components with memoized callbacks)
// ============================================================================

interface HapticsHook {
  /** Light tap - button presses, list item taps */
  lightTap: () => void;
  /** Medium tap - toggles, significant actions */
  mediumTap: () => void;
  /** Heavy tap - destructive actions, confirmations */
  heavyTap: () => void;
  /** Success notification - form submit success, save complete */
  success: () => void;
  /** Warning notification - validation warnings */
  warning: () => void;
  /** Error notification - validation errors, failed actions */
  error: () => void;
  /** Selection changed - pickers, segment controls */
  selection: () => void;
}

/**
 * Hook for haptic feedback with memoized callbacks.
 *
 * @example
 * const { lightTap, success } = useHaptics();
 * <Button onPress={() => { lightTap(); handlePress(); }} />
 */
export const useHaptics = (): HapticsHook => {
  const lightTap = useCallback(() => {
    triggerLightTap();
  }, []);

  const mediumTap = useCallback(() => {
    triggerMediumTap();
  }, []);

  const heavyTap = useCallback(() => {
    triggerHeavyTap();
  }, []);

  const success = useCallback(() => {
    triggerSuccess();
  }, []);

  const warning = useCallback(() => {
    triggerWarning();
  }, []);

  const error = useCallback(() => {
    triggerError();
  }, []);

  const selection = useCallback(() => {
    triggerSelection();
  }, []);

  return {
    lightTap,
    mediumTap,
    heavyTap,
    success,
    warning,
    error,
    selection,
  };
};

export default useHaptics;
