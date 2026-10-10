/**
 * Login Screen - SAP Fiori for iOS Design
 *
 * Implements SAP Fiori onboarding/welcome screen pattern (style guide §14.8)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
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

import { showAlert } from '@/utils/alert';
import { getLanguage, localizeDigits, normalizeDigits, t as tr } from '@/i18n';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { clearSignInDraft, readSignInDraft, saveSignInDraft } from '@/utils/signInDraft';
const APP_NAME = process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager';
/** Splits the agreement sentence at its two link placeholders, keeping them. */
const AGREEMENT_LINKS = /(\{\{terms\}\}|\{\{privacy\}\})/;

export default function LoginScreen() {
  const dispatch = useAppDispatch();
  const { isAuthenticating } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  // The warehouse this sign-in is for; becomes the facility picker with central login.
  const facility = getActiveOperatorServer();
  const facilityHost = facility ? facility.origin.replace(/^https:\/\//, '') : '';
  const facilityOrigin = facility?.origin ?? '';

  // The language switch below rebuilds every screen (app/_layout.tsx), this one
  // included: the number typed so far is kept outside the component and read back.
  const [phoneNumber, setPhoneNumberState] = useState(() => readSignInDraft(facilityOrigin));
  const setPhoneNumber = useCallback((value: string) => {
    setPhoneNumberState(value);
    saveSignInDraft(value, facilityOrigin);
  }, [facilityOrigin]);
  const typedNumber = useRef(phoneNumber);
  typedNumber.current = phoneNumber;
  useEffect(() => {
    const languageAtMount = getLanguage();
    saveSignInDraft(typedNumber.current, facilityOrigin);
    // Leaving for another screen forgets the number; a rebuild for a new language keeps it.
    return () => {
      if (getLanguage() === languageAtMount) clearSignInDraft();
    };
  }, [facilityOrigin]);

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
  // A countdown is a number: ૦-૯ in Gujarati.
  const countdown = localizeDigits(countdownText);

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
      showAlert(tr('auth.login.enterMobileTitle'), tr('auth.login.enterMobileMessage'));
      return;
    }

    if (!validatePhoneNumber(phoneNumber)) {
      showAlert(tr('auth.login.checkMobileTitle'), tr('auth.login.checkMobileMessage'));
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
        if (handleRateLimitError(result)) {
          return;
        }
        showAlert(
          tr('auth.login.couldNotSendTitle'),
          result.error || tr('common.checkConnection')
        );
      }
    } catch (error) {
      if (handleRateLimitError(error)) {
        return;
      }
      showAlert(tr('auth.login.couldNotSendTitle'), tr('common.checkConnection'));
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
                  {facility?.companyName || tr('auth.login.noWarehouse')}
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
                accessibilityLabel={tr('auth.server.change')}
                style={({ pressed }) => [styles.facilityChangeButton, pressed && styles.facilityChangePressed]}
              >
                <Text style={styles.facilityChange}>{tr('common.change')}</Text>
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
              <Text style={styles.welcomeTitle}>{tr('auth.signIn')}</Text>
              <Text style={styles.welcomeSubtitle}>
                {tr('auth.login.subtitle')}
              </Text>
            </View>

            {/* C. Rate Limit Warning (Fiori critical message strip) */}
            {isRateLimited && (
              <View
                style={styles.messageStrip}
                accessible={true}
                accessibilityRole="alert"
                accessibilityLabel={tr('auth.rateLimit.warningLabel', { message: rateLimitMessage, time: countdown })}
                accessibilityLiveRegion="polite"
              >
                <Icon name="alert" size={iconSize.md} color={t.status.critical.text} />
                <View style={styles.messageStripContent}>
                  <Text style={styles.messageStripTitle}>{rateLimitMessage}</Text>
                  <Text style={styles.messageStripText}>
                    {tr('auth.rateLimit.tryAgainIn', { time: countdown })}
                  </Text>
                </View>
              </View>
            )}

            {/* D. Form Section */}
            <View style={styles.formSection}>
              {/* Fiori Section Header */}
              <Text style={styles.sectionHeader} accessibilityRole="header">
                {tr('auth.login.mobileHeader')}
              </Text>

              <PhoneInput
                placeholder="98765 43210"
                value={formatPhoneDisplay(phoneNumber)}
                onChangeText={(text) => {
                  // ૦-૯ typed on a Gujarati keyboard count as 0-9.
                  const digitsOnly = normalizeDigits(text).replace(/\D/g, '');
                  setPhoneNumber(digitsOnly);
                }}
                maxLength={12}
                editable={!isAuthenticating && !isRateLimited}
                accessibilityLabel={tr('common.mobileNumber')}
                accessibilityHint={tr('auth.login.countryCodeHint', { code: '+91' })}
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
                loadingText={tr('auth.login.sendingCode')}
                accessibilityLabel={
                  isRateLimited
                    ? tr('auth.login.waitBeforeSending', { time: countdown })
                    : tr('auth.login.sendCode')
                }
                accessibilityHint={tr('auth.login.sendCodeHint')}
                accessibilityState={{
                  disabled: isAuthenticating || isRateLimited,
                  busy: isAuthenticating,
                }}
              >
                {isRateLimited ? tr('auth.rateLimit.wait', { time: countdown }) : tr('auth.login.sendCode')}
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
                {/* One sentence per language; the two links sit where its placeholders are. */}
                {tr('auth.legal.agreement').split(AGREEMENT_LINKS).map((part, index) => {
                  if (part === '{{terms}}') {
                    return (
                      <Text
                        key={index}
                        style={styles.footerLink}
                        onPress={() => router.push('/terms-of-service')}
                        accessibilityRole="link"
                        accessibilityLabel={tr('auth.legal.termsOfService')}
                      >
                        {tr('auth.legal.termsOfService')}
                      </Text>
                    );
                  }
                  if (part === '{{privacy}}') {
                    return (
                      <Text
                        key={index}
                        style={styles.footerLink}
                        onPress={() => router.push('/privacy-policy')}
                        accessibilityRole="link"
                        accessibilityLabel={tr('auth.legal.privacyPolicy')}
                      >
                        {tr('auth.legal.privacyPolicy')}
                      </Text>
                    );
                  }
                  return part;
                })}
              </Text>
              {/* The two pages are not translated: say so where they are linked. */}
              {getLanguage() === 'gu' && (
                <Text style={[styles.footerText, styles.footerNote]}>{tr('auth.legal.englishOnly')}</Text>
              )}
            </View>

            {/* G. Language: English or Gujarati, below everything so the form keeps its place */}
            <LanguageSwitch style={styles.languageSwitch} />
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

  footerNote: {
    marginTop: space.xs,
  },

  languageSwitch: {
    marginTop: space.lg,
  },
});
