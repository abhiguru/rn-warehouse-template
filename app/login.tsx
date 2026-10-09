/**
 * Login Screen - SAP Fiori for iOS Design
 *
 * Implements SAP Fiori onboarding/welcome screen pattern (style guide §14.8)
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

const APP_NAME = process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager';

export default function LoginScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const dispatch = useAppDispatch();
  const { isAuthenticating } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  // The warehouse this sign-in is for; becomes the facility picker with central login.
  const facility = getActiveOperatorServer();
  const facilityHost = facility ? facility.origin.replace(/^https:\/\//, '') : '';

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
      Alert.alert('Enter your mobile number', 'Enter your 10-digit mobile number to get a code.');
      return;
    }

    if (!validatePhoneNumber(phoneNumber)) {
      Alert.alert('Check your mobile number', 'Enter a 10-digit mobile number.');
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
          "Couldn't send the code",
          result.error || 'Check your connection and try again.'
        );
      }
    } catch (error) {
      if (handleRateLimitError(error)) {
        return;
      }
      Alert.alert("Couldn't send the code", 'Check your connection and try again.');
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + space.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Fiori: Welcome Screen Content */}
          <View style={styles.content}>
            {/* Facility line: which warehouse this sign-in is for (becomes the facility picker later) */}
            <View style={styles.facilityRow}>
              <Icon name="office-building-outline" size={iconSize.md} color={t.icon.secondary} />
              <View style={styles.facilityText}>
                <Text style={styles.facilityName} numberOfLines={1}>
                  {facility?.companyName || 'No warehouse selected'}
                </Text>
                {facilityHost ? (
                  <Text style={styles.facilityHost} numberOfLines={1}>
                    {facilityHost}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => router.push('/operator-server')}
                accessibilityRole="button"
                accessibilityLabel="Change warehouse server"
                style={({ pressed }) => [styles.facilityChangeButton, pressed && styles.facilityChangePressed]}
              >
                <Text style={styles.facilityChange}>Change</Text>
              </Pressable>
            </View>
            {/* A. Logo Section */}
            <View style={styles.logoContainer}>
              <BrandMark label={APP_NAME} />
            </View>

            {/* B. Welcome Message Section */}
            <View
              style={styles.welcomeSection}
              accessible={true}
              accessibilityRole="header"
            >
              <Text style={styles.appName}>{APP_NAME}</Text>
              <Text style={styles.welcomeTitle}>Sign in</Text>
              <Text style={styles.welcomeSubtitle}>
                Enter your mobile number to get a one-time code.
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

            {/* D. Form Section */}
            <View style={styles.formSection}>
              {/* Fiori Section Header */}
              <Text style={styles.sectionHeader} accessibilityRole="header">
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
                accessibilityHint="The +91 country code is added for you"
                autoComplete="tel-national"
                textContentType="telephoneNumber"
                returnKeyType="send"
                onSubmitEditing={handleSendOTP}
                leftIcon={
                  <View style={styles.countryCode}>
                    <Text style={styles.countryCodeText}>+91</Text>
                  </View>
                }
              />
            </View>

            {/* E. Primary Action Button (full width) */}
            <View style={styles.buttonSection}>
              <Button
                type="primary"
                size="fullWidth"
                onPress={handleSendOTP}
                disabled={isAuthenticating || isRateLimited}
                loading={isAuthenticating}
                loadingText="Sending code…"
                accessibilityLabel={
                  isRateLimited
                    ? `Wait ${countdownText} before sending a code`
                    : 'Send code'
                }
                accessibilityHint="Sends a one-time code to your mobile number"
                accessibilityState={{
                  disabled: isAuthenticating || isRateLimited,
                  busy: isAuthenticating,
                }}
              >
                {isRateLimited ? `Wait ${countdownText}` : 'Send code'}
              </Button>
            </View>

            {/* F. Footer Section */}
            <View
              style={styles.footerSection}
              accessible={true}
              accessibilityRole="text"
            >
              <View style={styles.footerDivider} />
              <Text style={styles.footerText}>
                By continuing, you agree to our{' '}
                <Text
                  style={styles.footerLink}
                  onPress={() => router.push('/terms-of-service')}
                  accessibilityRole="link"
                  accessibilityLabel="Terms of Service"
                >
                  Terms of Service
                </Text>
                {' '}and{' '}
                <Text
                  style={styles.footerLink}
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
// STYLES (style guide §14.8)
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },

  keyboardView: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center' as const,
  },

  // Centred form column, at most layout.maxFormWidth wide
  content: {
    paddingHorizontal: layout.marginCompact,
    maxWidth: layout.maxFormWidth,
    width: '100%' as const,
    alignSelf: 'center' as const,
  },

  // Facility line - compact, secondary to the sign-in form
  facilityRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.divider,
    backgroundColor: t.surface.card,
    marginBottom: space.giant,
  },
  facilityText: {
    flex: 1,
  },
  facilityName: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  facilityHost: {
    ...typography.caption1,
    color: t.text.secondary,
  },
  facilityChangeButton: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  facilityChangePressed: {
    backgroundColor: t.brand.subtle,
  },
  facilityChange: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },

  logoContainer: {
    alignItems: 'center' as const,
    marginBottom: space.xxl,
  },

  welcomeSection: {
    alignItems: 'center' as const,
    marginBottom: space.xxxl,
  },

  // App name under the mark (style guide §13.12)
  appName: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.sm,
  },

  welcomeTitle: {
    ...typography.title1,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginBottom: space.xs,
  },

  welcomeSubtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },

  // Fixed country code inside the phone field
  countryCode: {
    paddingRight: space.sm,
    marginRight: space.xs,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.border.divider,
  },
  countryCodeText: {
    ...typography.body,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },

  // Critical message strip (style guide §13.9)
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

  formSection: {
    marginBottom: space.xxl,
  },

  // Section header: footnote, capitals, secondary text
  sectionHeader: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    color: t.text.secondary,
    marginBottom: space.sm,
  },

  buttonSection: {
    marginBottom: space.xxl,
  },

  footerSection: {
    alignItems: 'center' as const,
    marginTop: space.lg,
  },

  footerDivider: {
    width: '100%' as const,
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.border.divider,
    marginBottom: space.lg,
  },

  footerText: {
    ...typography.caption1,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },

  footerLink: {
    ...typography.caption1,
    color: t.brand.tint,
    textDecorationLine: 'underline' as const,
  },
});
