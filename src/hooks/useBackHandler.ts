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

import { useCallback, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';

import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
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
    confirmationMessage = t('errors.unsaved.confirmBack'),
    confirmationTitle = t('common.discardChangesTitle'),
    onBackPress,
    onConfirmBack,
    exitRoute,
  } = options;

  const router = useRouter();

  // What Back does is read from here when it is pressed, so the listener below
  // never has to be taken off and put on again while the screen draws itself.
  // React Native asks the listener added last first: a listener that is added
  // again on every render ends up ahead of a bottom sheet opened in between,
  // and Back would leave the screen with the sheet still open.
  const latest = useRef({
    enabled,
    currentStep,
    stepBasePath,
    hasUnsavedChanges,
    confirmationMessage,
    confirmationTitle,
    onBackPress,
    onConfirmBack,
    exitRoute,
    router,
  });
  latest.current = {
    enabled,
    currentStep,
    stepBasePath,
    hasUnsavedChanges,
    confirmationMessage,
    confirmationTitle,
    onBackPress,
    onConfirmBack,
    exitRoute,
    router,
  };

  const handleBackPress = useCallback(() => {
    const now = latest.current;

    // Skip on iOS (iOS uses gestures, not hardware back button)
    if (Platform.OS !== 'android') {
      return false;
    }

    // If disabled, allow default behavior
    if (!now.enabled) {
      return false;
    }

    // If custom handler provided, use it
    if (now.onBackPress) {
      return now.onBackPress();
    }

    // Handle unsaved changes confirmation
    if (now.hasUnsavedChanges) {
      showAlert(
        now.confirmationTitle,
        now.confirmationMessage,
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
          {
            text: t('common.discard'),
            style: 'destructive',
            onPress: () => {
              latest.current.onConfirmBack?.();
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
      const { currentStep: step, stepBasePath: basePath, exitRoute: exit, router: nav } = latest.current;
      // Multi-step form navigation
      if (step !== undefined && basePath) {
        if (step > 1) {
          // Back to the previous step that is already in the stack: the steps
          // above it are taken off. `replace` put a second entry of that step
          // on top of the first ([step1, step1]), and the form's Discard then
          // showed the one under it, emptied (review 2026-10-13). When the
          // step is not in the stack, dismissTo replaces this one with it, as
          // `replace` did.
          const previousStep = step - 1;
          nav.dismissTo(`${basePath}${previousStep}` as Href);
        } else {
          // On first step, exit the form
          if (exit) {
            nav.replace(exit as Href);
          } else if (nav.canGoBack()) {
            nav.back();
          } else {
            nav.replace('/' as Href);
          }
        }
      } else {
        // Default back navigation
        if (nav.canGoBack()) {
          nav.back();
        } else if (exit) {
          nav.replace(exit as Href);
        }
      }
    }
  }, []);

  // Only while the screen is focused, and one listener for the whole of that
  // time: added on focus, removed on blur and when the screen is unmounted.
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
