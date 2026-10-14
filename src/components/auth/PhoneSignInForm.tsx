/**
 * The phone number step of a sign-in (style guide §14.8 step 1): brand mark,
 * app name, title, the fixed +91 field and "Send code".
 *
 * One layout for both sign-ins: a facility's own SMS sign-in (app/login.tsx,
 * with the facility line on top) and the association's central sign-in
 * (app/central-login.tsx, with the terms tick on a first sign-in). The screens
 * own the number, the request and what happens next; this component only draws.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { BrandMark } from '@/components/BrandMark';
import { PhoneInput } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { groupMobileDigits } from '@/utils/mobileGrouping';
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
  trackedText,
} from '@/theme/tokens';
import { getLanguage, normalizeDigits, t as tr } from '@/i18n';
import { LanguageSwitch } from '@/components/LanguageSwitch';

const APP_NAME = process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager';
/** Splits the agreement sentence at its two link placeholders, keeping them. */
const AGREEMENT_LINKS = /(\{\{terms\}\}|\{\{privacy\}\})/;

/** Ten digits, or twelve that begin with 91. */
export const isValidMobile = (phone: string): boolean => {
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length === 10) {
    return true;
  } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return true;
  }
  return false;
};

/** `+91` and ten digits. */
export const toInternationalMobile = (phone: string): string => {
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+${digitsOnly}`;
  }
  return phone;
};

export interface PhoneSignInFormProps {
  /** The facility this sign-in is for, with its "Change" action. Central sign-in passes none. */
  facility?: { name: string; host: string; onChange: () => void; changeLabel: string };
  /** A line under the subtitle. */
  note?: string;
  /** Digits only, as typed. */
  phoneNumber: string;
  onChangePhone: (digits: string) => void;
  /** A code is being requested. */
  busy: boolean;
  /** The countdown is already in the language's digits. */
  rateLimit: { isRateLimited: boolean; countdown: string; message: string };
  onSubmit: () => void;
  /** Shown as a tick box; "Send code" stays disabled until it is ticked. */
  terms?: { accepted: boolean; onToggle: () => void };
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}

export function PhoneSignInForm({
  facility,
  note,
  phoneNumber,
  onChangePhone,
  busy,
  rateLimit,
  onSubmit,
  terms,
  onOpenTerms,
  onOpenPrivacy,
}: PhoneSignInFormProps) {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  // A countdown is a number: ૦-૯ in Gujarati.
  const countdown = rateLimit.countdown;
  const termsMissing = Boolean(terms && !terms.accepted);

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
            {/* Facility line: which warehouse this sign-in is for. Central sign-in has none. */}
            {facility ? (
              <View style={styles.facilityRow}>
                <Icon name="office-building-outline" size={iconSize.md} color={t.icon.secondary} />
                <View style={styles.facilityText}>
                  <Text style={styles.facilityName} numberOfLines={1}>
                    {facility.name || tr('auth.login.noWarehouse')}
                  </Text>
                  {facility.host ? (
                    <Text style={styles.facilityHost} numberOfLines={1}>
                      {facility.host}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={facility.onChange}
                  accessibilityRole="button"
                  accessibilityLabel={facility.changeLabel}
                  style={({ pressed }) => [styles.facilityChangeButton, pressed && styles.facilityChangePressed]}
                >
                  <Text style={styles.facilityChange}>{tr('common.change')}</Text>
                </Pressable>
              </View>
            ) : null}
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
              {note ? <Text style={[styles.welcomeSubtitle, styles.note]}>{note}</Text> : null}
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

            {/* D. Form Section */}
            <View style={styles.formSection}>
              {/* Fiori Section Header */}
              <Text style={styles.sectionHeader} accessibilityRole="header">
                {tr('auth.login.mobileHeader')}
              </Text>

              <PhoneInput
                placeholder="98765 43210"
                value={groupMobileDigits(phoneNumber)}
                onChangeText={(text) => {
                  // ૦-૯ typed on a Gujarati keyboard count as 0-9.
                  const digitsOnly = normalizeDigits(text).replace(/\D/g, '');
                  onChangePhone(digitsOnly);
                }}
                maxLength={12}
                editable={!busy && !rateLimit.isRateLimited}
                accessibilityLabel={tr('common.mobileNumber')}
                accessibilityHint={tr('auth.login.countryCodeHint', { code: '+91' })}
                autoComplete="tel-national"
                textContentType="telephoneNumber"
                returnKeyType="send"
                onSubmitEditing={onSubmit}
                leftIcon={
                  <View style={styles.countryCode}>
                    <Text style={styles.countryCodeText}>+91</Text>
                  </View>
                }
              />
            </View>

            {/* First sign-in on this phone: the terms are accepted with a tick (central sign-in) */}
            {terms ? (
              <Pressable
                style={styles.termsRow}
                onPress={terms.onToggle}
                disabled={busy}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: terms.accepted, disabled: busy }}
                accessibilityLabel={tr('central.signIn.acceptTerms')}
                accessibilityHint={tr('central.signIn.acceptTermsHint')}
                testID="accept-terms"
              >
                <View style={[styles.checkbox, terms.accepted && styles.checkboxChecked]}>
                  {terms.accepted ? <Icon name="check" size={iconSize.sm} color={t.brand.onFill} /> : null}
                </View>
                <Text style={styles.termsLabel}>{tr('central.signIn.acceptTerms')}</Text>
              </Pressable>
            ) : null}

            {/* E. Primary Action Button (full width) */}
            <View style={styles.buttonSection}>
              <Button
                type="primary"
                size="fullWidth"
                onPress={onSubmit}
                disabled={busy || rateLimit.isRateLimited || termsMissing}
                loading={busy}
                loadingText={tr('auth.login.sendingCode')}
                accessibilityLabel={
                  rateLimit.isRateLimited
                    ? tr('auth.login.waitBeforeSending', { time: countdown })
                    : tr('auth.login.sendCode')
                }
                accessibilityHint={termsMissing ? tr('central.signIn.acceptFirst') : tr('auth.login.sendCodeHint')}
                accessibilityState={{
                  disabled: busy || rateLimit.isRateLimited || termsMissing,
                  busy: busy,
                }}
              >
                {rateLimit.isRateLimited ? tr('auth.rateLimit.wait', { time: countdown }) : tr('auth.login.sendCode')}
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
                        onPress={onOpenTerms}
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
                        onPress={onOpenPrivacy}
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

  note: {
    marginTop: space.xs,
  },

  // Terms checkbox (style guide §13.4): the whole row is the target
  termsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: touchTarget,
    marginBottom: space.lg,
  },
  checkbox: {
    width: space.xxl,
    height: space.xxl,
    borderRadius: radius.field,
    borderWidth: 2,
    borderColor: t.border.field,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  checkboxChecked: {
    backgroundColor: t.brand.fill,
    borderColor: t.brand.fill,
  },
  termsLabel: {
    ...typography.subhead,
    color: t.text.primary,
    flex: 1,
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
    letterSpacing: trackedText(0.5),
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
