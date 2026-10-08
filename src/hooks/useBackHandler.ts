/**
 * Android Back Handler Hook
 *
 * I11 Fix: Handles Android hardware back button in multi-step forms
 * and other screens that need custom back behavior.
 *
 * Features:
 * - Navigate to previous step in multi-step forms
 * - Show confirmation dialog for unsaved changes
 * - Prevent accidental app exit
 * - Platform-aware (only active on Android)
 *
 * @module hooks/useBackHandler
 */

import { useEffect, useCallback } from 'react';
import { BackHandler, Alert, Platform } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

export interface BackHandlerOptions {
  /**
   * Whether the handler is enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Current step number (1-based) for multi-step forms
   * If provided, will navigate to previous step
   */
  currentStep?: number;

  /**
   * Total number of steps in the form
   */
  totalSteps?: number;

  /**
   * Base path for step navigation (e.g., '/grn-form/step')
   * Step number will be appended (e.g., '/grn-form/step1')
   */
  stepBasePath?: string;

  /**
   * Whether there are unsaved changes that should trigger a confirmation
   * @default false
   */
  hasUnsavedChanges?: boolean;

  /**
   * Custom confirmation message for unsaved changes
   */
  confirmationMessage?: string;

  /**
   * Custom confirmation title
   */
  confirmationTitle?: string;

  /**
   * Custom handler called when back is pressed
   * Return true to prevent default behavior, false to allow it
   */
  onBackPress?: () => boolean;

  /**
   * Called when user confirms they want to go back (after confirmation dialog)
   */
  onConfirmBack?: () => void;

  /**
   * Route to navigate to when on first step (defaults to going back in history)
   */
  exitRoute?: string;
}

/**
 * Hook to handle Android hardware back button
 *
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * // Basic usage in a multi-step form
 * useBackHandler({
 *   currentStep: 2,
 *   totalSteps: 3,
 *   stepBasePath: '/grn-form/step',
 *   hasUnsavedChanges: formIsDirty,
 * });
 *
 * // Custom handler
 * useBackHandler({
 *   onBackPress: () => {
 *     // Custom logic
 *     return true; // Prevent default
 *   },
 * });
 * ```
 */
export function useBackHandler(options: BackHandlerOptions = {}): void {
  const {
    enabled = true,
    currentStep,
    totalSteps,
    stepBasePath,
    hasUnsavedChanges = false,
    confirmationMessage = 'You have unsaved changes. Are you sure you want to go back?',
    confirmationTitle = 'Discard changes?',
    onBackPress,
    onConfirmBack,
    exitRoute,
  } = options;

  const router = useRouter();

  const handleBackPress = useCallback(() => {
    // Skip on iOS (iOS uses gestures, not hardware back button)
    if (Platform.OS !== 'android') {
      return false;
    }

    // If disabled, allow default behavior
    if (!enabled) {
      return false;
    }

    // If custom handler provided, use it
    if (onBackPress) {
      return onBackPress();
    }

    // Handle unsaved changes confirmation
    if (hasUnsavedChanges) {
      Alert.alert(
        confirmationTitle,
        confirmationMessage,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              onConfirmBack?.();
              navigateBack();
            },
          },
        ],
        { cancelable: true }
      );
      return true; // Prevent default behavior
    }

    // Navigate back
    navigateBack();
    return true; // Prevent default behavior

    function navigateBack() {
      // Multi-step form navigation
      if (currentStep !== undefined && stepBasePath) {
        if (currentStep > 1) {
          // Go to previous step
          const previousStep = currentStep - 1;
          router.replace(`${stepBasePath}${previousStep}` as Href);
        } else {
          // On first step, exit the form
          if (exitRoute) {
            router.replace(exitRoute as Href);
          } else if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/' as Href);
          }
        }
      } else {
        // Default back navigation
        if (router.canGoBack()) {
          router.back();
        } else if (exitRoute) {
          router.replace(exitRoute as Href);
        }
      }
    }
  }, [
    enabled,
    onBackPress,
    hasUnsavedChanges,
    confirmationTitle,
    confirmationMessage,
    onConfirmBack,
    currentStep,
    stepBasePath,
    exitRoute,
    router,
  ]);

  // Use useFocusEffect to only handle back when screen is focused
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') {
        return;
      }

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        handleBackPress
      );

      return () => {
        subscription.remove();
      };
    }, [handleBackPress])
  );
}

/**
 * Simpler hook for just preventing back navigation with a confirmation
 *
 * @param hasUnsavedChanges - Whether to show confirmation
 * @param message - Custom confirmation message
 *
 * @example
 * ```tsx
 * useConfirmBack(formIsDirty, 'Discard your changes?');
 * ```
 */
export function useConfirmBack(
  hasUnsavedChanges: boolean,
  message?: string
): void {
  useBackHandler({
    hasUnsavedChanges,
    confirmationMessage: message,
  });
}

export default useBackHandler;
