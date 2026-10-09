/**
 * Login Screen - SAP Fiori for iOS Design
 *
 * Implements SAP Fiori onboarding/welcome screen pattern
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
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
  setAuthenticating,
  setPhoneNumber as setStorePhoneNumber,
  setOtpSent,
} from '@/store/slices/authSlice';
import { getPendingEnrollmentToken, signInWithPhone } from '@/config/supabaseConfig';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { BrandMark } from '@/components/BrandMark';
import { PhoneInput } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
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
    logoHeight: 64,
    buttonHeight: 44,
    borderRadius: 8,
    maxContentWidth: 375,
  },
};


export default function LoginScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const dispatch = useAppDispatch();
  const { isAuthenticating } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const FIORI = useFioriColors();
  // The warehouse this sign-in is for; becomes the facility picker with central login.
  const facility = getActiveOperatorServer();
  const facilityHost = facility ? facility.origin.replace(/^https:\/\//, '') : '';
  const { isDarkMode } = useTheme();

  useEffect(() => {
    let active = true;
    getPendingEnrollmentToken()
      .then(token => {
        if (active && token) router.replace('/pending-enrollment');
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Rate limit countdown
  const {
    isRateLimited,
    countdownText,
    message: rateLimitMessage,
    handleRateLimitError,
  } = useRateLimitCountdown();

  const validatePhoneNumber = (phone: string): boolean => {
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length === 10) {
      return true;
    } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      return true;
    }
    return false;
  };

  const formatPhoneNumber = (phone: string): string => {
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length === 10) {
      return `+91${digitsOnly}`;
    } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      return `+${digitsOnly}`;
    }
    return phone;
  };

  const handleSendOTP = async () => {
    if (isRateLimited) {
      return;
    }

    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }

    if (!validatePhoneNumber(phoneNumber)) {
      Alert.alert(
        'Invalid Phone Number',
        'Please enter a valid 10-digit phone number'
      );
      return;
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);

    try {
      dispatch(setAuthenticating(true));

      const result = await signInWithPhone(formattedPhone);

      if (result.success) {
        dispatch(setStorePhoneNumber(formattedPhone));
        dispatch(setOtpSent(true));
        router.push('/otp');
      } else {
        if (handleRateLimitError(result.error)) {
          return;
        }
        Alert.alert(
          'Error',
          result.error || 'Failed to send OTP. Please try again.'
        );
      }
    } catch (error) {
      if (handleRateLimitError(error)) {
        return;
      }
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      dispatch(setAuthenticating(false));
    }
  };

  // Indian mobile numbers are written 5 + 5 ("98765 43210"); group as the user types.
  const formatPhoneDisplay = (phone: string) => {
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length <= 10) {
      return digitsOnly.length > 5 ? `${digitsOnly.slice(0, 5)} ${digitsOnly.slice(5)}` : digitsOnly;
    }
    return phone;
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, backgroundColor: FIORI.colors.background },
      ]}
    >
      <EdgeToEdgeStatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + FIORI_STATIC.spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Fiori: Welcome Screen Content */}
          <View style={styles.content}>
            {/* Facility line: which warehouse this sign-in is for (becomes the facility picker later) */}
            <View
              style={[styles.facilityRow, { backgroundColor: FIORI.colors.backgroundSecondary, borderColor: FIORI.colors.divider }]}
            >
              <Icon name="warehouse" size={20} color={FIORI.colors.textSecondary} />
              <View style={styles.facilityText}>
                <Text style={[styles.facilityName, { color: FIORI.colors.textPrimary }]} numberOfLines={1}>
                  {facility?.companyName || 'No warehouse selected'}
                </Text>
                {facilityHost ? (
                  <Text style={[styles.facilityHost, { color: FIORI.colors.textSecondary }]} numberOfLines={1}>
                    {facilityHost}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => router.push('/operator-server')}
                accessibilityRole="button"
                accessibilityLabel="Change warehouse server"
                hitSlop={8}
              >
                <Text style={[styles.facilityChange, { color: FIORI.colors.tint }]}>Change</Text>
              </Pressable>
            </View>
            {/* A. Logo Section */}
            <View style={styles.logoContainer}>
              <BrandMark label={process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager'} />
            </View>

            {/* B. Welcome Message Section */}
            <View
              style={styles.welcomeSection}
              accessible={true}
              accessibilityRole="header"
            >
              <Text style={[styles.appName, { color: FIORI.colors.tint }]}>
                {process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager'}
              </Text>
              <Text
                style={[styles.welcomeTitle, { color: FIORI.colors.textPrimary }]}
              >
                Sign in
              </Text>
              <Text style={[styles.welcomeSubtitle, { color: FIORI.colors.textSecondary }]}>
                Enter your mobile number to get a one-time code.
              </Text>
            </View>

            {/* C. Rate Limit Warning Banner (Fiori Critical Message Strip) */}
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

            {/* D. Form Section */}
            <View style={styles.formSection}>
              {/* Fiori Section Header */}
              <Text
                style={[styles.sectionHeader, { color: FIORI.colors.textSecondary }]}
              >
                MOBILE NUMBER
              </Text>

              <PhoneInput
                placeholder="98765 43210"
                value={formatPhoneDisplay(phoneNumber)}
                onChangeText={(text) => {
                  const digitsOnly = text.replace(/\D/g, '');
                  setPhoneNumber(digitsOnly);
                }}
                maxLength={12}
                editable={!isAuthenticating && !isRateLimited}
                accessibilityLabel="Mobile number"
                leftIcon={
                  <View style={[styles.countryCode, { borderRightColor: FIORI.colors.divider }]}>
                    <Text style={[styles.countryCodeText, { color: FIORI.colors.textPrimary }]}>+91</Text>
                  </View>
                }
              />
            </View>

            {/* E. Primary Action Button (Fiori: 44pt height, full width) */}
            <View style={styles.buttonSection}>
              <Button
                type="primary"
                size="fullWidth"
                onPress={handleSendOTP}
                disabled={isAuthenticating || isRateLimited}
                loading={isAuthenticating}
                accessibilityLabel={
                  isRateLimited
                    ? `Wait ${countdownText} before sending OTP`
                    : 'Send OTP'
                }
                accessibilityHint="Sends a one-time password to your phone number"
                accessibilityState={{
                  disabled: isAuthenticating || isRateLimited,
                  busy: isAuthenticating,
                }}
              >
                {isRateLimited ? `Wait ${countdownText}` : 'Send code'}
              </Button>
            </View>

            {/* F. Footer Section (Fiori: Caption style, secondary text) */}
            <View
              style={styles.footerSection}
              accessible={true}
              accessibilityRole="text"
            >
              <View
                style={[styles.footerDivider, { backgroundColor: FIORI.colors.divider }]}
              />
              <Text
                style={[styles.footerText, { color: FIORI.colors.textTertiary }]}
              >
                By continuing, you agree to our{' '}
                <Text
                  style={[styles.footerLink, { color: FIORI.colors.tint }]}
                  onPress={() => router.push('/terms-of-service')}
                  accessibilityRole="link"
                  accessibilityLabel="Terms of Service"
                >
                  Terms of Service
                </Text>
                {' '}and{' '}
                <Text
                  style={[styles.footerLink, { color: FIORI.colors.tint }]}
                  onPress={() => router.push('/privacy-policy')}
                  accessibilityRole="link"
                  accessibilityLabel="Privacy Policy"
                >
                  Privacy Policy
                </Text>
              </Text>
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
  // Container - Fiori: White background (color applied inline)
  container: {
    flex: 1,
  },

  keyboardView: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // Content wrapper - Fiori: Centered, max width constrained
  content: {
    paddingHorizontal: FIORI_STATIC.spacing.lg,
    maxWidth: FIORI_STATIC.dimensions.maxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },

  // Facility line - compact, secondary to the sign-in form
  facilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI_STATIC.spacing.sm,
    paddingHorizontal: FIORI_STATIC.spacing.md,
    paddingVertical: FIORI_STATIC.spacing.sm,
    borderRadius: FIORI_STATIC.dimensions.borderRadius,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: FIORI_STATIC.spacing.xxl,
  },
  facilityText: {
    flex: 1,
  },
  facilityName: {
    ...FIORI_STATIC.typography.caption1,
    fontWeight: '600',
  },
  facilityHost: {
    ...FIORI_STATIC.typography.caption2,
  },
  facilityChange: {
    ...FIORI_STATIC.typography.caption1,
    fontWeight: '600',
    paddingVertical: FIORI_STATIC.spacing.xs,
  },

  // A. Logo Container - Fiori: Centered, adequate spacing
  logoContainer: {
    alignItems: 'center',
    marginBottom: FIORI_STATIC.spacing.lg,
  },



  // B. Welcome Section - Fiori: Centered text, hierarchical typography
  welcomeSection: {
    alignItems: 'center',
    marginBottom: FIORI_STATIC.spacing.xl,
  },

  // Fiori Display Large - Welcome title (color applied inline)
  welcomeTitle: {
    ...FIORI_STATIC.typography.displayLarge,
    textAlign: 'center',
    marginBottom: FIORI_STATIC.spacing.xs,
  },

  // App name above the title, in brand color (color applied inline)
  appName: {
    ...FIORI_STATIC.typography.caption1,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: FIORI_STATIC.spacing.sm,
  },

  welcomeSubtitle: {
    ...FIORI_STATIC.typography.caption1,
    textAlign: 'center',
  },

  // Fixed country code inside the phone field
  countryCode: {
    paddingRight: FIORI_STATIC.spacing.sm,
    marginRight: FIORI_STATIC.spacing.xs,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  countryCodeText: {
    fontSize: 17,
    fontWeight: '600',
  },

  // C. Message Strip (Fiori Critical/Warning Banner) (colors applied inline)
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

  // D. Form Section - Fiori: Section with header
  formSection: {
    marginBottom: FIORI_STATIC.spacing.lg,
  },

  // Fiori Section Header - 13pt, uppercase, secondary color (color applied inline)
  sectionHeader: {
    ...FIORI_STATIC.typography.caption1,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: FIORI_STATIC.spacing.sm,
  },

  // E. Button Section
  buttonSection: {
    marginBottom: FIORI_STATIC.spacing.lg,
  },

  // F. Footer Section - Fiori: Divider + caption text
  footerSection: {
    alignItems: 'center',
    marginTop: FIORI_STATIC.spacing.md,
  },

  // Fiori Divider (color applied inline)
  footerDivider: {
    width: '100%',
    height: 1,
    marginBottom: FIORI_STATIC.spacing.md,
  },

  // Fiori Caption 2 - Footer text (color applied inline)
  footerText: {
    ...FIORI_STATIC.typography.caption2,
    textAlign: 'center',
  },

  // Footer link text
  footerLink: {
    ...FIORI_STATIC.typography.caption2,
    textDecorationLine: 'underline',
  },
});
