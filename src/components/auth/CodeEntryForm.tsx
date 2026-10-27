/**
 * The code step of a sign-in (style guide §14.8 step 2): six boxes over one
 * hidden field with one-time-code autofill, submit on the sixth digit, a
 * resend link with a countdown and a way back.
 *
 * One layout for three uses: a facility's own SMS sign-in (app/otp.tsx), the
 * association's central sign-in (app/central-otp.tsx) and confirming a number
 * at a facility once to link an existing profile (app/facility-link.tsx). The
 * screens own the check of the code and what happens next.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
  type ThemeTokens,
  trackedText,
} from '@/theme/tokens';

import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
import { localizeDigits, normalizeDigits, t as tr } from '@/i18n';
import type { TextInputRef } from '@/types/nativeRefs';

export const CODE_LENGTH = 6;

export interface CodeEntryFormProps {
  /** The number the code was sent to, as stored; shown formatted. */
  phoneNumber: string;
  /** The heading; "Verify your phone" when not given. */
  title?: string;
  /** The line above the phone number; "Enter the 6-digit code sent to" when not given. */
  lead?: string;
  /** The code is being checked. */
  verifying: boolean;
  /** Another code is being requested. */
  resending: boolean;
  /** The countdown is already in the language's digits. */
  rateLimit: { isRateLimited: boolean; countdown: string; message: string };
  /** Called with six digits, from the button or on the sixth digit. */
  onVerify: (code: string) => void | Promise<void>;
  /** Ask for another code. True when one was sent: the timers start again and the boxes empty. */
  onResend: () => Promise<boolean>;
  onBack: () => void;
  /** The link under the form; "Wrong number?" when not given. */
  leave?: { label: string; accessibilityLabel: string; accessibilityHint: string };
}

export function CodeEntryForm({
  phoneNumber,
  title,
  lead,
  verifying,
  resending,
  rateLimit,
  onVerify,
  onResend,
  onBack,
  leave,
}: CodeEntryFormProps) {
  const [otpCode, setOtpCode] = useState('');
  const [resendTimer, setResendTimer] = useState(60);
  const [expiryTimer, setExpiryTimer] = useState(300); // 5 minutes
  const [, setFocusedIndex] = useState(0);
  const hiddenInputRef = useRef<TextInputRef | null>(null);
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  // A countdown is a number: ૦-૯ in Gujarati.
  const countdown = rateLimit.countdown;

  useEffect(() => {
    // Start countdown timers
    const timer = setInterval(() => {
      setResendTimer(prev => (prev > 0 ? prev - 1 : 0));
      setExpiryTimer(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(timer);
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
    };
  }, []);

  const submit = (code: string) => {
    if (code.length !== CODE_LENGTH) {
      showAlert(tr('auth.otp.incompleteTitle'), tr('auth.otp.incompleteMessage'));
      return;
    }
    // One submit per code: the button must not be followed by the sixth-digit timer.
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
    void onVerify(code);
  };

  const handleOtpChange = (value: string) => {
    // ૦-૯ typed on a Gujarati keyboard count as 0-9; the code is stored and sent in 0-9.
    const numericValue = normalizeDigits(value).replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
    setOtpCode(numericValue);
    setFocusedIndex(numericValue.length);

    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }

    // Auto-submit when 6 digits are entered
    if (numericValue.length === CODE_LENGTH && !verifying) {
      autoSubmitTimerRef.current = setTimeout(() => {
        submit(numericValue);
      }, 300);
    }
  };

  const focusHiddenInput = () => {
    hiddenInputRef.current?.blur();
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
    }
    focusTimerRef.current = setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 10);
  };

  const resend = async () => {
    if (resendTimer > 0 || rateLimit.isRateLimited) return;
    if (await onResend()) {
      setResendTimer(60);
      setExpiryTimer(300); // Reset to 5 minutes
      setOtpCode('');
      setFocusedIndex(0);
    }
  };

  // Format timer display (a number: ૦-૯ in Gujarati)
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return localizeDigits(`${mins}:${secs.toString().padStart(2, '0')}`);
  };

  const displayPhone = formatMobile(phoneNumber);

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.sm }]}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />

      {/* Hidden TextInput for code entry; the boxes below mirror its value */}
      <TextInput
        ref={hiddenInputRef}
        value={otpCode}
        onChangeText={handleOtpChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={CODE_LENGTH}
        autoFocus
        caretHidden
        editable={!verifying}
        style={styles.hiddenInput}
        accessibilityLabel={tr('auth.otp.codeLabel')}
        accessibilityHint={tr('auth.otp.codeHint', { phone: displayPhone })}
      />

      {/* Navigation bar - back button, outside the ScrollView */}
      <HeaderBackButton onPress={onBack} style={styles.backButton} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? space.md : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + space.max },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {/* A. Header Section */}
            <View
              style={styles.headerSection}
              accessible={true}
              accessibilityRole="header"
            >
              <View style={styles.iconContainer}>
                <Icon
                  name="shield-check-outline"
                  size={iconSize.xl}
                  color={t.brand.tint}
                />
              </View>
              <Text style={styles.title}>{title ?? tr('auth.otp.title')}</Text>
              <Text style={styles.description}>
                {lead ?? tr('auth.otp.sentToLead')}
              </Text>
              <Text style={styles.phoneNumber}>{displayPhone}</Text>
            </View>

            {/* B. Code Input Section */}
            <View style={styles.otpSection}>
              <Text style={styles.sectionHeader} accessibilityRole="header">
                {tr('auth.otp.codeHeader')}
              </Text>

              <Pressable
                style={styles.otpContainer}
                onPress={focusHiddenInput}
                accessibilityRole="button"
                accessibilityLabel={tr('auth.otp.codeProgress', { entered: otpCode.length, total: CODE_LENGTH })}
                accessibilityHint={tr('auth.otp.openKeyboardHint')}
              >
                {Array.from({ length: CODE_LENGTH }, (_, index) => {
                  const digit = otpCode[index] || '';
                  const isCurrent =
                    index === otpCode.length && otpCode.length < CODE_LENGTH;

                  return (
                    <View
                      key={index}
                      style={[styles.otpBox, isCurrent && styles.otpBoxFocused]}
                    >
                      <Text style={styles.otpDigit}>{digit}</Text>
                    </View>
                  );
                })}
              </Pressable>

              {/* Helper text */}
              <Text style={styles.helperText}>
                {tr('auth.otp.expiresIn', { time: formatTimer(expiryTimer) })}
              </Text>
            </View>

            {/* C. Rate Limit Warning (Fiori critical message strip) */}
            {rateLimit.isRateLimited && (
              <View
                style={styles.messageStrip}
                accessible={true}
                accessibilityRole="alert"
                accessibilityLabel={tr('auth.rateLimit.warningLabel', { message: rateLimit.message, time: countdown })}
                accessibilityLiveRegion="polite"
              >
                <Icon name="alert" size={iconSize.md} color={t.status.critical.text} />
                <View style={styles.messageStripContent}>
                  <Text style={styles.messageStripTitle}>{rateLimit.message}</Text>
                  <Text style={styles.messageStripText}>
                    {tr('auth.rateLimit.tryAgainIn', { time: countdown })}
                  </Text>
                </View>
              </View>
            )}

            {/* D. Primary Action Button: never disabled to signal a short code (§10) */}
            <View style={styles.buttonSection}>
              <Button
                type="primary"
                size="fullWidth"
                onPress={() => submit(otpCode)}
                disabled={verifying}
                loading={verifying}
                loadingText={tr('auth.otp.verifying')}
                accessibilityLabel={tr('auth.otp.verify')}
                accessibilityHint={tr('auth.otp.verifyHint')}
                accessibilityState={{
                  disabled: verifying,
                  busy: verifying,
                }}
              >
                {tr('auth.otp.verify')}
              </Button>
            </View>

            {/* E. Resend Section */}
            <View style={styles.resendSection}>
              <View style={styles.divider} />

              <Text style={styles.resendLabel}>
                {tr('auth.otp.notReceived')}
              </Text>

              {resendTimer > 0 || rateLimit.isRateLimited ? (
                <Text
                  style={styles.resendTimer}
                  accessible={true}
                  accessibilityRole="timer"
                  accessibilityLabel={
                    rateLimit.isRateLimited
                      ? tr('auth.otp.waitBeforeResending', { time: countdown })
                      : tr('auth.otp.resendAvailableIn', { time: formatTimer(resendTimer) })
                  }
                  accessibilityLiveRegion="polite"
                >
                  {rateLimit.isRateLimited
                    ? tr('auth.rateLimit.wait', { time: countdown })
                    : tr('auth.otp.resendIn', { time: formatTimer(resendTimer) })}
                </Text>
              ) : (
                <Button
                  type="tertiary"
                  variant="tint"
                  size="auto"
                  onPress={() => void resend()}
                  disabled={resending}
                  loading={resending}
                  accessibilityLabel={tr('auth.otp.resend')}
                  accessibilityHint={tr('auth.otp.resendHint', { phone: displayPhone })}
                  accessibilityState={{
                    disabled: resending,
                    busy: resending,
                  }}
                >
                  {tr('auth.otp.resend')}
                </Button>
              )}
            </View>

            {/* F. Wrong number: back to sign-in */}
            <View style={styles.changeNumberSection}>
              <Button
                type="tertiary"
                variant="tint"
                size="auto"
                onPress={onBack}
                accessibilityLabel={leave?.accessibilityLabel ?? tr('auth.otp.wrongNumberLabel')}
                accessibilityHint={leave?.accessibilityHint ?? tr('auth.otp.wrongNumberHint')}
              >
                {leave?.label ?? tr('auth.otp.wrongNumber')}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ============================================================================
// STYLES (style guide §14.8)
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },

  hiddenInput: {
    position: 'absolute' as const,
    top: -1000,
    left: 0,
    width: 1,
    height: 50,
    opacity: 0.01,
  },

  keyboardView: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
  },

  // Navigation bar - back button
  // Custom back button (same on every headerless screen): platform glyph,
  // brand.tint, the word "Back", at least touchTarget in size (§8)
  backButton: {
    alignSelf: 'flex-start' as const,
    marginLeft: space.xs,
    paddingLeft: space.xs,
  },

  content: {
    flex: 1,
    paddingHorizontal: layout.marginCompact,
    maxWidth: layout.maxFormWidth,
    width: '100%' as const,
    alignSelf: 'center' as const,
  },

  // A. Header Section
  headerSection: {
    alignItems: 'center' as const,
    marginBottom: space.lg,
    marginTop: space.sm,
  },

  iconContainer: {
    width: layout.avatar.lg,
    height: layout.avatar.lg,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: space.sm,
  },

  title: {
    ...typography.title1,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginBottom: space.sm,
  },

  description: {
    ...typography.body,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },

  // Phone number - emphasised by weight, not colour
  phoneNumber: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.xs,
    fontVariant: ['tabular-nums' as const],
  },

  // B. Code Section
  otpSection: {
    marginBottom: space.xxl,
  },

  // Section header: footnote, capitals, secondary text
  sectionHeader: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: trackedText(0.5),
    color: t.text.secondary,
    marginBottom: space.lg,
  },

  otpContainer: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginBottom: space.lg,
    minHeight: 70,
    paddingVertical: space.sm,
  },

  // One code box; shrinks on narrow phones so six always fit
  otpBox: {
    flex: 1,
    maxWidth: 48,
    height: 56,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.button,
    backgroundColor: t.surface.field,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  otpBoxFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
  },

  otpDigit: {
    ...typography.title2,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },

  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },

  // C. Critical message strip (style guide §13.9)
  messageStrip: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.status.critical.border,
    backgroundColor: t.status.critical.background,
    padding: space.md,
    marginBottom: space.xxl,
  },

  messageStripContent: {
    flex: 1,
    marginLeft: space.sm,
  },

  messageStripTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.status.critical.text,
  },

  messageStripText: {
    ...typography.footnote,
    color: t.status.critical.text,
    marginTop: space.xs,
  },

  // D. Button Section
  buttonSection: {
    marginBottom: space.lg,
  },

  // E. Resend Section
  resendSection: {
    alignItems: 'center' as const,
    marginBottom: space.sm,
  },

  divider: {
    width: '100%' as const,
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.border.divider,
    marginBottom: space.xxl,
  },

  resendLabel: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.sm,
  },

  resendTimer: {
    ...typography.callout,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },

  // F. Wrong number
  changeNumberSection: {
    alignItems: 'center' as const,
    marginTop: space.lg,
  },
});
