/**
 * Settings screen: a grouped list on background.grouped (style guide §14.12).
 *
 * Sections, in order: the profile card; Warehouse tools (by role and the
 * facility's capabilities); Preferences (Appearance, Language on this phone and
 * Brand, each a row with its current value that opens a sheet); Account (the actions of useAccountActions, then
 * deletion); Help and about (Help, terms, privacy); Development (development
 * builds only); the app version.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAppSelector } from '@/store/hooks';
import { useTheme, useThemedStyles } from '@/hooks/useTheme';
import { LANGUAGES, getLanguage, resolveLanguage, t, type LanguagePreference, type TranslationKey } from '@/i18n';
import { useAppLanguage } from '@/i18n/useAppLanguage';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import {
  BRANDS,
  getTokens,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type Brand,
  type ThemeTokens,
} from '@/theme/tokens';
import type { ThemePreference } from '@/store/slices/themeSlice';
import { Avatar } from '@/components/ui';
import { AppVersionFooter } from '@/components/AppVersionFooter';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ConfirmInputDialog } from '@/components/ConfirmInputDialog';
import { useAccountActions } from '@/features/account/useAccountActions';
import { SettingsRow, SettingsSection } from '@/features/settings/components/SettingsList';
import { PreferenceSheet } from '@/features/settings/components/PreferenceSheet';
import {
  rememberSheetAcrossRebuild,
  takeRememberedSheet,
  type PreferenceSheetId,
} from '@/features/settings/preferenceSheetMemory';
import { roleLabel as roleName } from '@/utils/roleLabel';
import { settingsFeatureRows, type SettingsFeature } from '@/config/roles';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { countPendingEnrollments } from '@/services/enrollmentReviewService';
import { useFacilityCapabilities } from '@/hooks/useCapability';

const THEME_OPTIONS: {
  value: ThemePreference;
  label: TranslationKey;
  icon: string;
}[] = [
  { value: 'system', label: 'settings.appearance.system', icon: 'cellphone' },
  { value: 'light', label: 'settings.appearance.light', icon: 'white-balance-sunny' },
  { value: 'dark', label: 'settings.appearance.dark', icon: 'weather-night' },
];

/** Brand names by their stored value. */
const BRAND_NAME_KEYS: Record<Brand, TranslationKey> = {
  orange: 'settings.brand.orange',
  gcsa: 'settings.brand.gcsa',
};

const SettingsScreen: React.FC = () => {
  const { userProfile } = useAppSelector(state => state.auth);
  const capabilities = useFacilityCapabilities();
  const insets = useSafeAreaInsets();
  // Sign-out, leaving the facility and deletion: the same actions as Profile (§14.8).
  const account = useAccountActions();
  const {
    preference: themePreference,
    setPreference: setThemePreference,
    isDarkMode,
    brand,
    setBrand,
    resolvedMode,
    tokens,
  } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { language, preference: languagePreference, setPreference: setLanguagePreference } = useAppLanguage();
  // A language change rebuilds this screen; the sheet that made it opens again.
  const [sheet, setSheet] = useState<PreferenceSheetId | null>(takeRememberedSheet);
  // How many access requests wait, read each time Settings is shown (administrators only). Null: none, or not readable.
  const [waitingRequests, setWaitingRequests] = useState<number | null>(null);

  const languageOptions: { value: LanguagePreference; label: string; accessibilityLabel: string; icon: string }[] = [
    { value: 'system', label: t('settings.language.system'), accessibilityLabel: t('settings.language.system'), icon: 'cellphone' },
    ...LANGUAGES.map(option => ({
      ...option,
      accessibilityLabel: t('settings.language.optionLabel', { language: option.label }),
      icon: 'translate',
    })),
  ];
  const chooseLanguage = (next: LanguagePreference) => {
    if (resolveLanguage(next) !== language) rememberSheetAcrossRebuild('language');
    setLanguagePreference(next);
  };

  const brandSwatches = (option: Brand) => {
    const swatch = getTokens(option, resolvedMode);
    return (
      <View style={styles.brandSwatches}>
        <View style={[styles.brandSwatch, { backgroundColor: swatch.brand.fill }]} />
        <View style={[styles.brandSwatch, { backgroundColor: swatch.brand.secondary }]} />
      </View>
    );
  };

  // Feature rows by role: the same table the server uses (src/config/roles.ts). A row of a
  // capability this facility does not have (Sensors) is not shown.
  const FEATURE_ROWS: Record<SettingsFeature, { icon: string; label: string; subtitle: string; value?: string; route: string }> = {
    customers: { icon: 'account-outline', label: t('common.customers'), subtitle: t('settings.features.customersSubtitle'), route: '/customers' },
    enrollmentReview: {
      icon: 'account-plus-outline',
      label: t('auth.review.screenTitle'),
      subtitle: t('settings.features.enrollmentReviewSubtitle'),
      value: waitingRequests ? t('settings.features.enrollmentReviewWaiting', { count: waitingRequests }) : undefined,
      route: '/enrollment-review',
    },
    items: { icon: 'cube-outline', label: t('common.items'), subtitle: t('settings.features.itemsSubtitle'), route: '/items' },
    users: { icon: 'account-circle-outline', label: t('users.list.title'), subtitle: t('settings.features.usersSubtitle'), route: '/users' },
    standardRate: { icon: 'tag-multiple-outline', label: t('settings.features.standardRate'), subtitle: t('settings.features.standardRateSubtitle'), route: '/standard-rate' },
    sensors: { icon: 'thermometer', label: t('settings.features.sensors'), subtitle: t('settings.features.sensorsSubtitle'), route: '/sensors' },
  };
  const featureRows = settingsFeatureRows(userProfile?.role, capabilities);
  const showsRequests = featureRows.includes('enrollmentReview');
  useFocusEffect(useCallback(() => {
    if (!showsRequests) { setWaitingRequests(null); return undefined; }
    let current = true;
    countPendingEnrollments()
      .then(count => { if (current) setWaitingRequests(count > 0 ? count : null); })
      .catch(() => { if (current) setWaitingRequests(null); });
    return () => { current = false; };
  }, [showsRequests]));

  // The server in use, named under "Change warehouse server" (as Help names the facility).
  const activeServer = getActiveOperatorServer();
  const serverName = activeServer ? activeServer.companyName || activeServer.displayName : '';

  // With central login the card also names the facility the person is in: "Admin · North Cold Store".
  const roleLabel = roleName(userProfile?.role);
  const roleLine =
    account.mode !== 'legacy' && account.facilityName
      ? t('settings.profileRoleAtFacility', { role: roleLabel, facility: account.facilityName })
      : roleLabel;
  const profileName = userProfile?.name || t('users.fallbackName');
  const themeLabel = t(THEME_OPTIONS.find(option => option.value === themePreference)?.label ?? 'settings.appearance.system');
  const languageLabel = languageOptions.find(option => option.value === languagePreference)?.label ?? t('settings.language.system');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={tokens.statusBarStyle} />

      {/* Fiori Navigation Bar */}
      <View style={styles.navigationBar}>
        <HeaderBackButton style={styles.navBackButton} />
        <Text style={styles.navTitle} accessibilityRole="header">
          {t('settings.title')}
        </Text>
        <View style={styles.navPlaceholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Account: user profile card */}
        <Pressable
          style={({ pressed }) => [styles.profileCard, pressed && styles.rowPressed]}
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel={`${profileName}, ${roleLabel}${account.mode !== 'legacy' && account.facilityName ? `, ${account.facilityName}` : ''}`}
          accessibilityHint={t('settings.profileHint')}
        >
          <Avatar name={profileName} id={userProfile?.id} size="lg" />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profileName}</Text>
            <Text style={styles.profileRole}>{roleLine}</Text>
          </View>
          <Icon name="chevron-right" size={iconSize.md} color={tokens.icon.secondary} />
        </Pressable>

        {/* Warehouse tools: a customer account has none */}
        {featureRows.length > 0 && (
          <SettingsSection title={t('settings.features.title')} testID="settings-section-tools">
            {featureRows.map((feature, index) => (
              <SettingsRow
                key={feature}
                testID={`settings-feature-${feature}`}
                icon={FEATURE_ROWS[feature].icon}
                label={FEATURE_ROWS[feature].label}
                subtitle={FEATURE_ROWS[feature].subtitle}
                value={FEATURE_ROWS[feature].value}
                onPress={() => router.push(FEATURE_ROWS[feature].route as never)}
                last={index === featureRows.length - 1}
              />
            ))}
          </SettingsSection>
        )}

        {/* Preferences: each row shows its value and opens a sheet */}
        <SettingsSection title={t('settings.preferences.title')} testID="settings-section-preferences">
          <SettingsRow
            testID="settings-pref-appearance"
            icon="theme-light-dark"
            label={t('settings.appearance.title')}
            value={themeLabel}
            onPress={() => setSheet('appearance')}
          />
          <SettingsRow
            testID="settings-pref-language"
            icon="translate"
            label={t('settings.language.rowLabel')}
            value={languageLabel}
            onPress={() => setSheet('language')}
          />
          <SettingsRow
            testID="settings-pref-brand"
            leading={brandSwatches(brand)}
            label={t('settings.brand.title')}
            value={t(BRAND_NAME_KEYS[brand])}
            onPress={() => setSheet('brand')}
            last
          />
        </SettingsSection>

        {/* Account */}
        <SettingsSection title={t('settings.account.title')} testID="settings-section-account">
          {account.mode === 'legacy' ? (
            <SettingsRow
              icon="server"
              label={t('auth.server.change')}
              subtitle={serverName ? t('settings.server.rowSubtitle', { facility: serverName }) : undefined}
              onPress={() => router.push('/operator-server')}
            />
          ) : null}
          {account.actions.map((action, index) => (
            <SettingsRow
              key={action.id}
              testID={action.testID}
              icon={action.icon}
              label={action.label}
              subtitle={action.subtitle}
              onPress={() => account.request(action.id)}
              showChevron={false}
              destructive={action.destructive}
              last={!account.deletion.available && index === account.actions.length - 1}
            />
          ))}
          {/* Not offered to a profile without a mobile number: the final step asks for it. */}
          {account.deletion.available ? (
            <SettingsRow
              testID="account-delete"
              icon="trash-can-outline"
              label={account.deletion.label}
              subtitle={account.deletion.checking ? t('common.checking') : account.deletion.subtitle}
              onPress={account.deletion.open}
              busy={account.deletion.checking}
              showChevron={false}
              destructive
              last
            />
          ) : null}
        </SettingsSection>

        {/* Help and about. The two legal pages are not translated: in Gujarati the footer says so. */}
        <SettingsSection
          title={t('settings.help.sectionTitle')}
          footer={getLanguage() === 'gu' ? t('auth.legal.englishOnly') : undefined}
          testID="settings-section-help"
        >
          <SettingsRow
            testID="settings-help"
            icon="help-circle-outline"
            label={t('settings.help.row')}
            subtitle={t('settings.help.rowSubtitle')}
            onPress={() => router.push('/help')}
          />
          <SettingsRow
            icon="file-document-outline"
            label={t('settings.about.terms')}
            subtitle={t('settings.about.termsSubtitle')}
            onPress={() => router.push('/terms-of-service')}
          />
          <SettingsRow
            icon="shield-check-outline"
            label={t('settings.about.privacy')}
            subtitle={t('settings.about.privacySubtitle')}
            onPress={() => router.push('/privacy-policy')}
            last
          />
        </SettingsSection>

        {__DEV__ && (
          <SettingsSection title={t('settings.development.title')} testID="settings-section-development">
            <SettingsRow
              icon="palette-outline"
              label={t('settings.development.styleGuide')}
              subtitle={t('settings.development.styleGuideSubtitle')}
              onPress={() => router.push('/style-guide')}
              last
            />
          </SettingsSection>
        )}

        <AppVersionFooter />
      </ScrollView>

      <PreferenceSheet
        visible={sheet === 'appearance'}
        testID="settings-sheet-appearance"
        title={t('settings.appearance.title')}
        options={THEME_OPTIONS.map(option => ({ value: option.value, label: t(option.label), icon: option.icon }))}
        selected={themePreference}
        onSelect={setThemePreference}
        onClose={() => setSheet(null)}
        notes={[
          themePreference === 'system'
            ? t(isDarkMode ? 'settings.appearance.footerSystemDark' : 'settings.appearance.footerSystemLight')
            : t(themePreference === 'dark' ? 'settings.appearance.footerDark' : 'settings.appearance.footerLight'),
        ]}
      />
      <PreferenceSheet
        visible={sheet === 'language'}
        testID="settings-sheet-language"
        title={t('settings.language.rowLabel')}
        options={languageOptions}
        selected={languagePreference}
        onSelect={chooseLanguage}
        onClose={() => setSheet(null)}
        notes={[
          t(languagePreference === 'system' ? 'settings.language.footerSystem' : 'settings.language.footerChosen'),
          t('settings.language.deviceNote'),
        ]}
      />
      <PreferenceSheet
        visible={sheet === 'brand'}
        testID="settings-sheet-brand"
        title={t('settings.brand.title')}
        options={BRANDS.map(option => ({
          value: option,
          label: t(BRAND_NAME_KEYS[option]),
          accessibilityLabel: t('settings.brand.optionLabel', { brand: t(BRAND_NAME_KEYS[option]) }),
          leading: brandSwatches(option),
        }))}
        selected={brand}
        onSelect={setBrand}
        onClose={() => setSheet(null)}
        notes={[t('settings.brand.footer')]}
      />

      {/* Account dialogs (style guide §13.9) */}
      <ConfirmDialog {...account.dialog} />
      <ConfirmInputDialog {...account.deletion.dialog} />
    </View>
  );
};

// ============================================================================
// STYLES (grouped list on background.grouped, style guide §14.12)
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.grouped,
  },

  // Navigation Bar
  navigationBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  navBackButton: {
    minWidth: 80,
  },
  navTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  navPlaceholder: {
    width: 80,
  },

  scrollView: {
    flex: 1,
  },

  // Profile Card
  profileCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginHorizontal: layout.marginCompact,
    marginTop: space.lg,
    marginBottom: space.xxl,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
  },
  rowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  profileInfo: {
    flex: 1,
    marginLeft: space.lg,
    marginRight: space.sm,
  },
  profileName: {
    ...typography.headline,
    color: t.text.primary,
    marginBottom: space.xxs,
  },
  profileRole: {
    ...typography.subhead,
    color: t.text.secondary,
  },

  // Brand swatches, drawn from each brand's own tokens
  brandSwatches: {
    flexDirection: 'row' as const,
    gap: space.xxs,
  },
  brandSwatch: {
    width: iconSize.sm,
    height: iconSize.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.separator,
  },
});

export default SettingsScreen;
