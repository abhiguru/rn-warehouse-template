/**
 * OTP Verification Screen - SAP Fiori for iOS Design
 *
 * Implements SAP Fiori onboarding verification pattern
 * @see https://www.sap.com/design-system/fiori-design-ios/patterns/onboarding/
 * @see design/sap-fiori-specs/06-text-input-form-cell.md
 * @see design/sap-fiori-specs/08-button.md
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
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
import { useFioriColors } from '@/theme/fioriColors';
import { useTheme } from '@/hooks/useTheme';

// Static design tokens (typography, spacing, dimensions)
const FIORI_STATIC = {
  typography: {
    displayLarge: {
      fontSize: 34,
      lineHeight: 41,
      fontWeight: '700' as const,
      letterSpacing: 0.37,
    },
    title1: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '700' as const,
      letterSpacing: 0.36,
    },
    title3: {
      fontSize: 20,
      lineHeight: 25,
      fontWeight: '600' as const,
      letterSpacing: 0.38,
    },
    body: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '400' as const,
      letterSpacing: -0.41,
    },
    caption1: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '400' as const,
      letterSpacing: -0.08,
    },
    caption2: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },
    otpDigit: {
      fontSize: 24,
      lineHeight: 28,
      fontWeight: '600' as const,
      letterSpacing: 0,
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  dimensions: {
    otpBoxSize: 48,
    otpBoxGap: 12,
    buttonHeight: 44,
    borderRadius: 8,
    maxContentWidth: 375,
  },
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
  const FIORI = useFioriColors();
  const { isDarkMode } = useTheme();

  const dispatch = useAppDispatch();
  const { phoneNumber, isVerifyingOTP, isAuthenticating } = useAppSelector(
    (state) => state.auth
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
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
      setExpiryTimer((prev) => (prev > 0 ? prev - 1 : 0));
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
    if (__DEV__) console.log('[OTP] Input changed, raw value:', value);
    const numericValue = value.replace(/[^0-9]/g, '').slice(0, 6);
    if (__DEV__) console.log('[OTP] Numeric value:', numericValue);
    setOtpCode(numericValue);
    setFocusedIndex(numericValue.length);

    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }

    // Auto-submit when 6 digits are entered
    if (numericValue.length === 6 && !isVerifyingOTP) {
      if (__DEV__) console.log('[OTP] 6 digits entered, auto-submitting...');
      autoSubmitTimerRef.current = setTimeout(() => {
        handleVerifyOTPWithCode(numericValue);
      }, 300);
    }
  };

  const focusHiddenInput = () => {
    if (__DEV__) console.log('[OTP] Focusing hidden input...');
    hiddenInputRef.current?.blur();
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
    }
    focusTimerRef.current = setTimeout(() => {
      hiddenInputRef.current?.focus();
      if (__DEV__) console.log('[OTP] Hidden input focused');
    }, 10);
  };

  const handleVerifyOTPWithCode = async (code: string) => {
    if (code.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the complete 6-digit OTP');
      return;
    }

    try {
      dispatch(setVerifyingOTP(true));

      if (__DEV__)
        console.log('[OTP] Verifying OTP for phone:', phoneNumber, 'Code:', code);
      const result = await verifyOTP(phoneNumber, code);

      if (result.success && result.data) {
        if (__DEV__) console.log('[OTP] Verification successful');

        if (result.data.customAuth && result.data.userProfile) {
          if (__DEV__)
            console.log('[OTP] Custom JWT auth successful, setting user profile');
          dispatch(setUserProfile(result.data.userProfile));

          if (__DEV__) console.log('[OTP] Redirecting to home screen');
          router.replace('/');
        } else if (result.data.session && result.data.user) {
          if (__DEV__)
            console.log('[OTP] GoTrue session established, updating Redux state');

          dispatch(setSession(result.data.session));
          dispatch(setUser(result.data.user));
          dispatch(setUserProfile(result.data.userProfile));

          if (__DEV__) console.log('[OTP] Redirecting to home screen');
          router.replace('/');
        } else {
          if (__DEV__) console.log('[OTP] Verification successful but no redirect');
        }
      } else {
        const friendlyMessage = parseErrorToFriendly(
          (result as { success: false; error: string }).error
        );
        Alert.alert('Verification Failed', friendlyMessage);
      }
    } catch (error) {
      console.error('[OTP] Verification error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
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

      if (__DEV__) console.log('[OTP] Resending OTP to:', phoneNumber);
      const result = await signInWithPhone(phoneNumber);

      if (result.success) {
        setResendTimer(60);
        setExpiryTimer(300); // Reset to 5 minutes
        setOtpCode('');
        setFocusedIndex(0);
        Alert.alert(
          'Code Sent',
          'A new verification code has been sent to your phone.'
        );
      } else {
        if (handleRateLimitError(result.error)) {
          return;
        }
        const friendlyMessage = parseErrorToFriendly(result.error);
        Alert.alert('Could Not Send Code', friendlyMessage);
      }
    } catch (error) {
      console.error('[OTP] Resend error:', error);
      if (handleRateLimitError(error)) {
        return;
      }
      Alert.alert('Error', 'Something went wrong. Please try again.');
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

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 8, backgroundColor: FIORI.colors.background },
      ]}
    >
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={FIORI.colors.background}
      />

      {/* Hidden TextInput for OTP entry */}
      <TextInput
        ref={hiddenInputRef}
        value={otpCode}
        onChangeText={handleOtpChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="off"
        maxLength={6}
        autoFocus
        caretHidden
        editable={!isVerifyingOTP}
        style={styles.hiddenInput}
        accessibilityLabel="OTP input"
        accessibilityHint="Enter the 6-digit code sent to your phone"
      />

      {/* Fiori: Navigation Bar - Back Button - Outside ScrollView */}
      <Pressable
        style={styles.backButtonNav}
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Icon name="chevron-left" size={28} color={FIORI.colors.tint} />
        <Text style={[styles.backButtonText, { color: FIORI.colors.tint }]}>
          Back
        </Text>
      </Pressable>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Fiori: Verification Content */}
          <View style={styles.content}>
            {/* A. Header Section */}
            <View
              style={styles.headerSection}
              accessible={true}
              accessibilityRole="header"
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: FIORI.colors.tintLight },
                ]}
              >
                <Icon
                  name="shield-check-outline"
                  size={32}
                  color={FIORI.colors.tint}
                />
              </View>
              <Text style={[styles.title, { color: FIORI.colors.textPrimary }]}>
                Verify Your Phone
              </Text>
              <Text
                style={[styles.description, { color: FIORI.colors.textSecondary }]}
              >
                Enter the 6-digit code sent to
              </Text>
              <Text style={[styles.phoneNumber, { color: FIORI.colors.tint }]}>
                {phoneNumber}
              </Text>
            </View>

            {/* B. OTP Input Section */}
            <View style={styles.otpSection}>
              <Text
                style={[styles.sectionHeader, { color: FIORI.colors.textSecondary }]}
              >
                VERIFICATION CODE
              </Text>

              <Pressable style={styles.otpContainer} onPress={focusHiddenInput}>
                {[0, 1, 2, 3, 4, 5].map((index) => {
                  const digit = otpCode[index] || '';
                  const isFilled = digit !== '';
                  const isCurrent =
                    index === otpCode.length && otpCode.length < 6;

                  return (
                    <View
                      key={index}
                      style={[
                        styles.otpBox,
                        {
                          borderColor: FIORI.colors.inputBorder,
                          backgroundColor: FIORI.colors.backgroundSecondary,
                        },
                        isFilled && { backgroundColor: FIORI.colors.background },
                        isCurrent && {
                          borderColor: FIORI.colors.inputBorderFocus,
                          backgroundColor: FIORI.colors.background,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.otpDigit,
                          { color: FIORI.colors.textTertiary },
                          isFilled && { color: FIORI.colors.textPrimary },
                        ]}
                      >
                        {digit}
                      </Text>
                    </View>
                  );
                })}
              </Pressable>

              {/* Helper text */}
              <Text
                style={[styles.helperText, { color: FIORI.colors.textTertiary }]}
              >
                Code expires in {formatTimer(expiryTimer)}
              </Text>
            </View>

            {/* C. Rate Limit Warning (Fiori Message Strip) */}
            {isRateLimited && (
              <View
                style={[
                  styles.messageStrip,
                  {
                    backgroundColor: FIORI.colors.warningLight,
                    borderLeftColor: FIORI.colors.warning,
                  },
                ]}
                accessible={true}
                accessibilityRole="alert"
                accessibilityLabel={`Rate limited. ${rateLimitMessage}. Try again in ${countdownText}`}
                accessibilityLiveRegion="polite"
              >
                <Icon
                  name="clock-outline"
                  size={20}
                  color={FIORI.colors.warning}
                />
                <View style={styles.messageStripContent}>
                  <Text
                    style={[
                      styles.messageStripTitle,
                      { color: FIORI.colors.textPrimary },
                    ]}
                  >
                    {rateLimitMessage}
                  </Text>
                  <Text
                    style={[
                      styles.messageStripText,
                      { color: FIORI.colors.textSecondary },
                    ]}
                  >
                    Try again in {countdownText}
                  </Text>
                </View>
              </View>
            )}

            {/* D. Primary Action Button */}
            <View style={styles.buttonSection}>
              <Button
                type="primary"
                size="fullWidth"
                onPress={handleVerifyOTP}
                disabled={isVerifyingOTP || otpCode.length !== 6}
                loading={isVerifyingOTP}
                accessibilityLabel="Verify code"
                accessibilityHint="Verifies the 6-digit code you entered"
                accessibilityState={{
                  disabled: isVerifyingOTP || otpCode.length !== 6,
                  busy: isVerifyingOTP,
                }}
              >
                Verify
              </Button>
            </View>

            {/* E. Resend Section */}
            <View style={styles.resendSection}>
              <View
                style={[styles.divider, { backgroundColor: FIORI.colors.divider }]}
              />

              <Text
                style={[styles.resendLabel, { color: FIORI.colors.textSecondary }]}
              >
                Didn't receive the code?
              </Text>

              {resendTimer > 0 || isRateLimited ? (
                <Text
                  style={[styles.resendTimer, { color: FIORI.colors.textTertiary }]}
                  accessible={true}
                  accessibilityRole="timer"
                  accessibilityLabel={
                    isRateLimited
                      ? `Rate limited, wait ${countdownText}`
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
                  accessibilityHint="Sends a new verification code to your phone"
                  accessibilityState={{
                    disabled: isAuthenticating,
                    busy: isAuthenticating,
                  }}
                >
                  Resend Code
                </Button>
              )}
            </View>

            {/* F. Change Number Link */}
            <View style={styles.changeNumberSection}>
              <Button
                type="tertiary"
                variant="normal"
                size="auto"
                onPress={handleBack}
                accessibilityLabel="Change phone number"
                accessibilityHint="Go back to enter a different phone number"
              >
                Change Phone Number
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ============================================================================
// SAP FIORI STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Container (color applied inline)
  container: {
    flex: 1,
  },

  hiddenInput: {
    position: 'absolute',
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

  // Fiori Navigation Bar - Back button
  backButtonNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI_STATIC.spacing.sm,
    paddingVertical: FIORI_STATIC.spacing.md,
  },

  backButtonText: {
    ...FIORI_STATIC.typography.body,
    marginLeft: FIORI_STATIC.spacing.xs,
  },

  // Content wrapper
  content: {
    flex: 1,
    paddingHorizontal: FIORI_STATIC.spacing.lg,
    maxWidth: FIORI_STATIC.dimensions.maxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },

  // A. Header Section
  headerSection: {
    alignItems: 'center',
    marginBottom: FIORI_STATIC.spacing.md,
    marginTop: FIORI_STATIC.spacing.sm,
  },

  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: FIORI_STATIC.spacing.sm,
  },

  // Fiori Display - Title (color applied inline)
  title: {
    ...FIORI_STATIC.typography.title1,
    textAlign: 'center',
    marginBottom: FIORI_STATIC.spacing.sm,
  },

  // Fiori Body - Description (color applied inline)
  description: {
    ...FIORI_STATIC.typography.body,
    textAlign: 'center',
  },

  // Phone number - emphasized (color applied inline)
  phoneNumber: {
    ...FIORI_STATIC.typography.body,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: FIORI_STATIC.spacing.xs,
  },

  // B. OTP Section
  otpSection: {
    marginBottom: FIORI_STATIC.spacing.lg,
  },

  // Fiori Section Header (color applied inline)
  sectionHeader: {
    ...FIORI_STATIC.typography.caption1,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: FIORI_STATIC.spacing.md,
  },

  // OTP Container
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 70,
    paddingVertical: 8,
  },

  // OTP Box (colors applied inline)
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },

  // OTP Digit (color applied inline)
  otpDigit: {
    ...FIORI_STATIC.typography.otpDigit,
  },

  // Cursor animation
  cursor: {
    position: 'absolute',
    bottom: 12,
    width: 20,
    height: 2,
  },

  // Helper text (color applied inline)
  helperText: {
    ...FIORI_STATIC.typography.caption1,
    textAlign: 'center',
  },

  // C. Message Strip (colors applied inline)
  messageStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: FIORI_STATIC.dimensions.borderRadius,
    padding: FIORI_STATIC.spacing.md,
    marginBottom: FIORI_STATIC.spacing.lg,
    borderLeftWidth: 4,
  },

  messageStripContent: {
    flex: 1,
    marginLeft: FIORI_STATIC.spacing.sm,
  },

  messageStripTitle: {
    ...FIORI_STATIC.typography.caption1,
    fontWeight: '600',
  },

  messageStripText: {
    ...FIORI_STATIC.typography.caption1,
    marginTop: FIORI_STATIC.spacing.xs,
  },

  // D. Button Section
  buttonSection: {
    marginBottom: FIORI_STATIC.spacing.md,
  },

  // E. Resend Section
  resendSection: {
    alignItems: 'center',
    marginBottom: FIORI_STATIC.spacing.sm,
  },

  divider: {
    width: '100%',
    height: 1,
    marginBottom: FIORI_STATIC.spacing.lg,
  },

  resendLabel: {
    ...FIORI_STATIC.typography.caption1,
    marginBottom: FIORI_STATIC.spacing.sm,
  },

  resendTimer: {
    ...FIORI_STATIC.typography.body,
    fontWeight: '500',
  },

  // F. Change Number Section
  changeNumberSection: {
    alignItems: 'center',
    marginTop: FIORI_STATIC.spacing.md,
  },
});
