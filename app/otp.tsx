/**
 * OTP Verification Screen - SAP Fiori for iOS Design
 *
 * Implements SAP Fiori onboarding verification pattern
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
import { router } from 'expo-router';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  setVerifyingOTP,
  setAuthenticating,
  setSession,
  setUser,
  setUserProfile,
  setOtpSent,
} from '@/store/slices/authSlice';
import { verifyOTP, signInWithPhone } from '@/config/supabaseConfig';
import { Button } from '@/components/ui/Button';
import { parseErrorToFriendly } from '@/utils/errorHandler';
import { useRateLimitCountdown } from '@/hooks/useRateLimitCountdown';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

import { showAlert } from '@/utils/alert';
const CODE_LENGTH = 6;

/** "+919876543210" -> "+91 98765 43210" (style guide §12.3). */
const formatPhoneForDisplay = (phone: string) => {
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
};

export default function OTPScreen() {
  const [otpCode, setOtpCode] = useState('');
  const [resendTimer, setResendTimer] = useState(60);
  const [expiryTimer, setExpiryTimer] = useState(300); // 5 minutes
  const [focusedIndex, setFocusedIndex] = useState(0);
  const hiddenInputRef = useRef<TextInput | null>(null);
  const autoSubmitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const focusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const dispatch = useAppDispatch();
  const { phoneNumber, isVerifyingOTP, isAuthenticating } = useAppSelector(
    state => state.auth
  );

  // Rate limit countdown
  const {
    isRateLimited,
    countdownText,
    message: rateLimitMessage,
    handleRateLimitError,
  } = useRateLimitCountdown();

  useEffect(() => {
    if (!phoneNumber) {
      router.replace('/login');
      return;
    }

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
  }, [phoneNumber]);

  const handleOtpChange = (value: string) => {
    const numericValue = value.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
    setOtpCode(numericValue);
    setFocusedIndex(numericValue.length);

    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }

    // Auto-submit when 6 digits are entered
    if (numericValue.length === CODE_LENGTH && !isVerifyingOTP) {
      autoSubmitTimerRef.current = setTimeout(() => {
        handleVerifyOTPWithCode(numericValue);
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

  const handleVerifyOTPWithCode = async (code: string) => {
    if (code.length !== CODE_LENGTH) {
      showAlert('Enter the full code', 'Enter all 6 digits of the code we sent you.');
      return;
    }

    try {
      dispatch(setVerifyingOTP(true));

      const result = await verifyOTP(phoneNumber, code);

      if (result.success && result.data) {
        if (result.data.action === 'pending') {
          dispatch(setOtpSent(false));
          router.replace('/pending-enrollment');
        } else if (result.data.customAuth && result.data.userProfile) {
          dispatch(setUserProfile(result.data.userProfile));

          router.replace('/');
        } else if (result.data.session && result.data.user) {
          dispatch(setSession(result.data.session));
          dispatch(setUser(result.data.user));
          dispatch(setUserProfile(result.data.userProfile));

          router.replace('/');
        }
      } else {
        const friendlyMessage = parseErrorToFriendly(
          (result as { success: false; error: string }).error
        );
        showAlert("Couldn't verify the code", friendlyMessage);
      }
    } catch {
      showAlert("Couldn't verify the code", 'Check your connection and try again.');
    } finally {
      dispatch(setVerifyingOTP(false));
    }
  };

  const handleVerifyOTP = async () => {
    await handleVerifyOTPWithCode(otpCode);
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0 || isRateLimited) return;

    try {
      dispatch(setAuthenticating(true));

      const result = await signInWithPhone(phoneNumber);

      if (result.success) {
        setResendTimer(60);
        setExpiryTimer(300); // Reset to 5 minutes
        setOtpCode('');
        setFocusedIndex(0);
        showAlert(
          'Code sent',
          `A new code was sent to ${formatPhoneForDisplay(phoneNumber)}.`
        );
      } else {
        if (handleRateLimitError(result.error)) {
          return;
        }
        const friendlyMessage = parseErrorToFriendly(result.error);
        showAlert("Couldn't send the code", friendlyMessage);
      }
    } catch (error) {
      if (handleRateLimitError(error)) {
        return;
      }
      showAlert("Couldn't send the code", 'Check your connection and try again.');
    } finally {
      dispatch(setAuthenticating(false));
    }
  };

  const handleBack = () => {
    dispatch(setOtpSent(false));
    router.back();
  };

  // Format timer display
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const displayPhone = formatPhoneForDisplay(phoneNumber);

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
        editable={!isVerifyingOTP}
        style={styles.hiddenInput}
        accessibilityLabel="Verification code"
        accessibilityHint={`Enter the 6-digit code sent to ${displayPhone}`}
      />

      {/* Navigation bar - back button, outside the ScrollView */}
      <Pressable
        style={({ pressed }) => [styles.backButtonNav, pressed && styles.backButtonPressed]}
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Icon name="chevron-left" size={iconSize.lg} color={t.brand.tint} />
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>

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
              <Text style={styles.title}>Verify your phone</Text>
              <Text style={styles.description}>
                Enter the 6-digit code sent to
              </Text>
              <Text style={styles.phoneNumber}>{displayPhone}</Text>
            </View>

            {/* B. Code Input Section */}
            <View style={styles.otpSection}>
              <Text style={styles.sectionHeader} accessibilityRole="header">
                VERIFICATION CODE
              </Text>

              <Pressable
                style={styles.otpContainer}
                onPress={focusHiddenInput}
                accessibilityRole="button"
                accessibilityLabel={`Verification code, ${otpCode.length} of ${CODE_LENGTH} digits entered`}
                accessibilityHint="Opens the keyboard to type the code"
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
                Code expires in {formatTimer(expiryTimer)}
              </Text>
            </View>

            {/* C. Rate Limit Warning (Fiori critical message strip) */}
            {isRateLimited && (
              <View
                style={styles.messageStrip}
                accessible={true}
                accessibilityRole="alert"
                accessibilityLabel={`Warning. ${rateLimitMessage}. Try again in ${countdownText}`}
                accessibilityLiveRegion="polite"
              >
                <Icon name="alert" size={iconSize.md} color={t.status.critical.text} />
                <View style={styles.messageStripContent}>
                  <Text style={styles.messageStripTitle}>{rateLimitMessage}</Text>
                  <Text style={styles.messageStripText}>
                    Try again in {countdownText}
                  </Text>
                </View>
              </View>
            )}

            {/* D. Primary Action Button: never disabled to signal a short code (§10) */}
            <View style={styles.buttonSection}>
              <Button
                type="primary"
                size="fullWidth"
                onPress={handleVerifyOTP}
                disabled={isVerifyingOTP}
                loading={isVerifyingOTP}
                loadingText="Verifying…"
                accessibilityLabel="Verify code"
                accessibilityHint="Verifies the 6-digit code you entered"
                accessibilityState={{
                  disabled: isVerifyingOTP,
                  busy: isVerifyingOTP,
                }}
              >
                Verify code
              </Button>
            </View>

            {/* E. Resend Section */}
            <View style={styles.resendSection}>
              <View style={styles.divider} />

              <Text style={styles.resendLabel}>
                Didn't receive the code?
              </Text>

              {resendTimer > 0 || isRateLimited ? (
                <Text
                  style={styles.resendTimer}
                  accessible={true}
                  accessibilityRole="timer"
                  accessibilityLabel={
                    isRateLimited
                      ? `Wait ${countdownText} before resending`
                      : `Resend available in ${formatTimer(resendTimer)}`
                  }
                  accessibilityLiveRegion="polite"
                >
                  {isRateLimited
                    ? `Wait ${countdownText}`
                    : `Resend in ${formatTimer(resendTimer)}`}
                </Text>
              ) : (
                <Button
                  type="tertiary"
                  variant="tint"
                  size="auto"
                  onPress={handleResendOTP}
                  disabled={isAuthenticating}
                  loading={isAuthenticating}
                  accessibilityLabel="Resend code"
                  accessibilityHint={`Sends a new code to ${displayPhone}`}
                  accessibilityState={{
                    disabled: isAuthenticating,
                    busy: isAuthenticating,
                  }}
                >
                  Resend code
                </Button>
              )}
            </View>

            {/* F. Wrong number: back to sign-in */}
            <View style={styles.changeNumberSection}>
              <Button
                type="tertiary"
                variant="tint"
                size="auto"
                onPress={handleBack}
                accessibilityLabel="Wrong number? Change mobile number"
                accessibilityHint="Goes back to enter a different mobile number"
              >
                Wrong number?
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
  backButtonNav: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    minHeight: touchTarget,
    paddingLeft: space.xs,
    paddingRight: space.md,
    marginLeft: space.xs,
    borderRadius: radius.button,
  },
  backButtonPressed: {
    backgroundColor: t.brand.subtle,
  },

  backButtonText: {
    ...typography.body,
    color: t.brand.tint,
    marginLeft: space.xxs,
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
    letterSpacing: 0.5,
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
