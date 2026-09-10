/**
 * Sentry/GlitchTip Configuration
 *
 * GlitchTip is a Sentry-compatible error tracking service.
 * This module provides centralized crash reporting using the @sentry/react-native SDK.
 */

import * as Sentry from '@sentry/react-native';
import type { ErrorEvent } from '@sentry/react-native';
import Constants from 'expo-constants';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

/**
 * Initialize Sentry/GlitchTip crash reporting
 * Call this at app startup before any React code runs
 */
export function initializeSentry(): void {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    release: Constants.expoConfig?.version || '1.0.0',
    dist: Constants.expoConfig?.android?.versionCode?.toString() || '1',

    // Only enabled when DSN is provided (opt-in)
    enabled: !__DEV__ && !!SENTRY_DSN,

    // Sample rate for performance monitoring (0 = disabled to reduce overhead)
    tracesSampleRate: 0,

    // Don't send PII by default (GDPR compliance)
    sendDefaultPii: false,

    // Attach stack traces to all messages for better debugging
    attachStacktrace: true,

    // Filter sensitive data before sending
    beforeSend(event: ErrorEvent) {
      // Redact phone numbers
      if (event.user?.phone) {
        event.user.phone = '[REDACTED]';
      }

      // Redact any OTP-related data in extra context
      if (event.extra) {
        const extra = event.extra as Record<string, unknown>;
        if ('otp' in extra) {
          extra.otp = '[REDACTED]';
        }
        if ('phoneNumber' in extra) {
          extra.phoneNumber = '[REDACTED]';
        }
      }

      return event;
    },
  });
}

/**
 * Set user context for error reports
 * Call after successful login to associate errors with users
 */
export function setSentryUser(userId: string, role?: string): void {
  Sentry.setUser({
    id: userId,
    role: role,
  });
}

/**
 * Clear user context on logout
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

/**
 * Capture an exception with optional context
 * Use this to manually report errors to GlitchTip
 */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message with severity level
 * Use for non-error events that should still be logged
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  Sentry.captureMessage(message, level);
}

/**
 * Add breadcrumb for debugging context
 * Breadcrumbs appear in error reports to show what happened before the error
 */
export function addBreadcrumb(
  message: string,
  category: string = 'app',
  level: Sentry.SeverityLevel = 'info'
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    timestamp: Date.now() / 1000,
  });
}

// Re-export Sentry for advanced usage (e.g., Sentry.wrap)
export { Sentry };
