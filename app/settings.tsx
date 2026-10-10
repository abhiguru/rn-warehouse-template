/**
 * Settings screen: a grouped list on background.grouped (style guide §14.12).
 *
 * Sections: account (profile), app features, appearance (System, Light, Dark),
 * brand (Orange, GCSA navy), account actions, about (legal pages) and, in
 * development builds, the style guide gallery.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { logout, deleteAccount } from '@/store/slices/authSlice';
import { useTheme, useThemedStyles, useTokens } from '@/hooks/useTheme';
import { LANGUAGES, getLanguage, normalizeDigits, t, type LanguagePreference, type TranslationKey } from '@/i18n';
import { useAppLanguage } from '@/i18n/useAppLanguage';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import {
  BRANDS,
  fontWeight,
  getTokens,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { ThemePreference } from '@/store/slices/themeSlice';

import { showAlert } from '@/utils/alert';
import { Avatar } from '@/components/ui';
import { roleLabel as roleName } from '@/utils/roleLabel';
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
const BRAND_NAME_KEYS: Record<(typeof BRANDS)[number], TranslationKey> = {
  orange: 'settings.brand.orange',
  gcsa: 'settings.brand.gcsa',
};

const SettingsScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const { userProfile } = useAppSelector(state => state.auth);
  const insets = useSafeAreaInsets();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'warning' | 'confirm'>(
    'warning'
  );
  const [deleteConfirmPhone, setDeleteConfirmPhone] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteFocused, setDeleteFocused] = useState(false);
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
  const { preference: languagePreference, setPreference: setLanguagePreference } = useAppLanguage();
  const languageOptions: { value: LanguagePreference; label: string; icon: string }[] = [
    { value: 'system', label: t('settings.language.system'), icon: 'cellphone' },
    ...LANGUAGES.map(language => ({ ...language, icon: 'translate' })),
  ];

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    try {
      await dispatch(logout()).unwrap();
      router.replace('/login');
    } catch {
      showAlert(t('auth.signOut.couldNotTitle'), t('common.checkConnection'));
      setShowLogoutModal(false);
    } finally {
      setLoggingOut(false);
    }
  };

  // Delete account handlers
  const handleDeleteAccount = () => {
    setDeleteStep('warning');
    setDeleteConfirmPhone('');
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const handleDeleteProceed = () => {
    setDeleteStep('confirm');
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setDeleteStep('warning');
    setDeleteConfirmPhone('');
    setDeleteError(null);
  };

  const confirmDeleteAccount = async () => {
    // Verify phone number matches
    // Check all possible phone field names due to type inconsistencies
    const userPhone = userProfile?.mobile || userProfile?.phoneNumber || '';
    const normalizedUserPhone = userPhone.replace(/\D/g, '').slice(-10);
    // ૦-૯ typed on a Gujarati keyboard count as 0-9.
    const normalizedInputPhone = normalizeDigits(deleteConfirmPhone)
      .replace(/\D/g, '')
      .slice(-10);

    if (normalizedInputPhone !== normalizedUserPhone) {
      setDeleteError(t('settings.deleteAccount.mismatch'));
      return;
    }

    setDeletingAccount(true);
    setDeleteError(null);

    try {
      await dispatch(deleteAccount()).unwrap();
      setShowDeleteModal(false);
      router.replace('/login');
    } catch (error) {
      setDeleteError(
        typeof error === 'string'
          ? error
          : t('settings.deleteAccount.failed')

      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleProfile = () => {
    router.push('/profile');
  };

  const handleItemPricing = () => {
    router.push('/item-pricing');
  };

  const handleSensors = () => {
    router.push('/sensors');
  };

  const handleCustomers = () => {
    router.push('/customers');
  };

  const handleItems = () => {
    router.push('/items');
  };

  const handleUsers = () => {
    router.push('/users');
  };

  // Permissions
  const canAccessItemPricing = !!userProfile;
  const canManageCustomers =
    !!userProfile &&
    (userProfile.role === 'supervisor' || userProfile.role === 'admin');
  const canManageItems =
    !!userProfile &&
    (userProfile.role === 'supervisor' || userProfile.role === 'admin');
  const canManageUsers =
    !!userProfile &&
    (userProfile.role === 'supervisor' || userProfile.role === 'admin');

  const roleLabel = roleName(userProfile?.role);
  const profileName = userProfile?.name || t('users.fallbackName');

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
          onPress={handleProfile}
          accessibilityRole="button"
          accessibilityLabel={`${profileName}, ${roleLabel}`}
          accessibilityHint={t('settings.profileHint')}
        >
          <Avatar name={profileName} id={userProfile?.id} size="lg" />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profileName}</Text>
            <Text style={styles.profileRole}>{roleLabel}</Text>
          </View>
          <Icon name="chevron-right" size={iconSize.md} color={tokens.icon.secondary} />
        </Pressable>

        {/* App Features Section */}
        <SettingsSection title={t('settings.features.title')}>
          {canManageCustomers && (
            <SettingsRow
              icon="account-outline"
              label={t('common.customers')}
              subtitle={t('settings.features.customersSubtitle')}
              onPress={handleCustomers}
            />
          )}
          {userProfile?.role === 'admin' && (
            <SettingsRow
              icon="account-plus-outline"
              label={t('auth.review.screenTitle')}
              subtitle={t('settings.features.enrollmentReviewSubtitle')}
              onPress={() => router.push('/enrollment-review')}
            />
          )}
          {canManageItems && (
            <SettingsRow
              icon="cube-outline"
              label={t('common.items')}
              subtitle={t('settings.features.itemsSubtitle')}
              onPress={handleItems}
            />
          )}
          {canManageUsers && (
            <SettingsRow
              icon="account-circle-outline"
              label={t('users.list.title')}
              subtitle={t('settings.features.usersSubtitle')}
              onPress={handleUsers}
            />
          )}
          {canAccessItemPricing && (
            <SettingsRow
              icon="tag-outline"
              label={t('settings.features.itemPricing')}
              subtitle={t('settings.features.itemPricingSubtitle')}
              onPress={handleItemPricing}
            />
          )}
          <SettingsRow
            icon="thermometer"
            label={t('settings.features.sensors')}
            subtitle={t('settings.features.sensorsSubtitle')}
            onPress={handleSensors}
            last
          />
        </SettingsSection>

        {/* Appearance Section */}
        <SettingsSection
          title={t('settings.appearance.title')}
          footer={
            themePreference === 'system'
              ? t(isDarkMode ? 'settings.appearance.footerSystemDark' : 'settings.appearance.footerSystemLight')
              : t(themePreference === 'dark' ? 'settings.appearance.footerDark' : 'settings.appearance.footerLight')
          }
        >
          <View style={styles.optionGroup} accessibilityRole="radiogroup" accessibilityLabel={t('settings.appearance.title')}>
            {THEME_OPTIONS.map(option => {
              const isSelected = themePreference === option.value;
              const label = t(option.label);
              return (
                <Pressable
                  key={option.value}
                  style={({ pressed }) => [
                    styles.option,
                    isSelected && styles.optionSelected,
                    pressed && !isSelected && styles.optionPressed,
                  ]}
                  onPress={() => setThemePreference(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, checked: isSelected }}
                  accessibilityLabel={label}
                >
                  <View style={[styles.optionIcon, isSelected && styles.optionIconSelected]}>
                    <Icon
                      name={option.icon}
                      size={iconSize.lg}
                      color={isSelected ? tokens.brand.onFill : tokens.icon.primary}
                    />
                  </View>
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SettingsSection>

        {/* Language Section: English or Gujarati for the whole app (docs/I18N.md) */}
        <SettingsSection
          title={t('settings.language.title')}
          footer={t(languagePreference === 'system' ? 'settings.language.footerSystem' : 'settings.language.footerChosen')}
        >
          <View style={styles.optionGroup} accessibilityRole="radiogroup" accessibilityLabel={t('settings.language.title')}>
            {languageOptions.map(option => {
              const isSelected = languagePreference === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={({ pressed }) => [
                    styles.option,
                    isSelected && styles.optionSelected,
                    pressed && !isSelected && styles.optionPressed,
                  ]}
                  onPress={() => setLanguagePreference(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, checked: isSelected }}
                  accessibilityLabel={
                    option.value === 'system' ? option.label : t('settings.language.optionLabel', { language: option.label })
                  }
                >
                  <View style={[styles.optionIcon, isSelected && styles.optionIconSelected]}>
                    <Icon
                      name={option.icon}
                      size={iconSize.lg}
                      color={isSelected ? tokens.brand.onFill : tokens.icon.primary}
                    />
                  </View>
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SettingsSection>

        {/* Brand Section: colour palette for the whole app (docs/STYLE_GUIDE.md) */}
        <SettingsSection title={t('settings.brand.title')} footer={t('settings.brand.footer')}>
          <View style={styles.optionGroup} accessibilityRole="radiogroup" accessibilityLabel={t('settings.brand.title')}>
            {BRANDS.map(option => {
              const isSelected = brand === option;
              const swatch = getTokens(option, resolvedMode);
              const brandName = t(BRAND_NAME_KEYS[option]);
              return (
                <Pressable
                  key={option}
                  style={({ pressed }) => [
                    styles.option,
                    isSelected && styles.optionSelected,
                    pressed && !isSelected && styles.optionPressed,
                  ]}
                  onPress={() => setBrand(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, checked: isSelected }}
                  accessibilityLabel={t('settings.brand.optionLabel', { brand: brandName })}
                >
                  <View style={styles.brandSwatches} accessible={false}>
                    <View style={[styles.brandSwatch, { backgroundColor: swatch.brand.fill }]} />
                    <View style={[styles.brandSwatch, { backgroundColor: swatch.brand.secondary }]} />
                  </View>
                  <View style={styles.optionLabelRow}>
                    {isSelected && (
                      <Icon name="check" size={iconSize.sm} color={tokens.brand.tint} />
                    )}
                    <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                      {brandName}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </SettingsSection>

        {/* Account Section */}
        <SettingsSection title={t('settings.account.title')}>
          <SettingsRow
            icon="server"
            label={t('auth.server.change')}
            onPress={() => router.push('/operator-server')}
          />
          <SettingsRow
            icon="logout"
            label={t('auth.signOut.action')}
            onPress={handleLogout}
            showChevron={false}
            destructive
          />
          <SettingsRow
            icon="trash-can-outline"
            label={t('settings.account.deleteAccount')}
            subtitle={t('settings.account.deleteAccountSubtitle')}
            onPress={handleDeleteAccount}
            showChevron={false}
            destructive
            last
          />
        </SettingsSection>

        {/* About Section */}
        {/* The two pages are not translated: in Gujarati the footer says so. */}
        <SettingsSection
          title={t('settings.about.title')}
          footer={getLanguage() === 'gu' ? t('auth.legal.englishOnly') : undefined}
        >
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
          <SettingsSection title={t('settings.development.title')}>
            <SettingsRow
              icon="palette-outline"
              label={t('settings.development.styleGuide')}
              subtitle={t('settings.development.styleGuideSubtitle')}
              onPress={() => router.push('/style-guide')}
              last
            />
          </SettingsSection>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerTitle}>
            {process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager'}
          </Text>
          <Text style={styles.footerSubtitle}>{t('settings.footer.version', { version: '1.0' })}</Text>
        </View>
      </ScrollView>

      {/* Sign-out confirmation (style guide §13.9) */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !loggingOut && setShowLogoutModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !loggingOut && setShowLogoutModal(false)}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        >
          <Pressable
            style={styles.modalDialog}
            onPress={e => e.stopPropagation()}
            accessibilityViewIsModal
            accessible={false}
          >
            <Icon name="logout" size={iconSize.xl} color={tokens.status.negative.text} />
            <Text style={styles.modalTitle} accessibilityRole="header">
              {t('auth.signOut.confirmTitle')}
            </Text>
            <Text style={styles.modalMessage}>
              {t('auth.signOut.confirmMessage')}
            </Text>

            <View style={styles.modalActions}>
              <DialogButton
                label={t('common.cancel')}
                onPress={() => setShowLogoutModal(false)}
                disabled={loggingOut}
              />
              <DialogButton
                label={t('auth.signOut.action')}
                destructive
                busy={loggingOut}
                onPress={confirmLogout}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !deletingAccount && handleDeleteCancel()}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !deletingAccount && handleDeleteCancel()}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        >
          <Pressable
            style={styles.modalDialog}
            onPress={e => e.stopPropagation()}
            accessibilityViewIsModal
            accessible={false}
          >
            <Icon name="trash-can-outline" size={iconSize.xl} color={tokens.status.negative.text} />

            {deleteStep === 'warning' ? (
              <>
                {/* Warning Step */}
                <Text style={styles.modalTitle} accessibilityRole="header">
                  {t('settings.deleteAccount.warningTitle')}
                </Text>
                <Text style={[styles.modalMessage, styles.modalMessageLeft]}>
                  {t('settings.deleteAccount.warningMessage')}
                </Text>

                <View style={styles.modalActions}>
                  <DialogButton label={t('common.cancel')} onPress={handleDeleteCancel} />
                  <DialogButton label={t('common.continue')} destructive onPress={handleDeleteProceed} />
                </View>
              </>
            ) : (
              <>
                {/* Confirm Step */}
                <Text style={styles.modalTitle} accessibilityRole="header">
                  {t('settings.deleteAccount.confirmTitle')}
                </Text>
                <Text style={styles.modalMessage}>
                  {t('settings.deleteAccount.confirmMessage')}
                </Text>

                <TextInput
                  style={[
                    styles.deleteConfirmInput,
                    deleteFocused && styles.deleteConfirmInputFocused,
                    !!deleteError && styles.deleteConfirmInputError,
                  ]}
                  placeholder={t('settings.deleteAccount.phonePlaceholder')}
                  placeholderTextColor={tokens.text.placeholder}
                  value={deleteConfirmPhone}
                  onChangeText={text => {
                    setDeleteConfirmPhone(text);
                    setDeleteError(null);
                  }}
                  onFocus={() => setDeleteFocused(true)}
                  onBlur={() => setDeleteFocused(false)}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  editable={!deletingAccount}
                  accessibilityLabel={t('common.mobileNumber')}
                />

                {deleteError && (
                  <View style={styles.deleteErrorRow} accessibilityLiveRegion="polite">
                    <Icon name="alert-circle" size={iconSize.sm} color={tokens.status.negative.text} />
                    <Text style={styles.deleteErrorText}>{deleteError}</Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <DialogButton
                    label={t('common.cancel')}
                    onPress={handleDeleteCancel}
                    disabled={deletingAccount}
                  />
                  <DialogButton
                    label={t('settings.account.deleteAccount')}
                    destructive
                    busy={deletingAccount}
                    onPress={confirmDeleteAccount}
                  />
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

// ============================================================================
// ROWS, SECTIONS AND DIALOG BUTTONS
// ============================================================================

/** A grouped-list section: header, rows on surface.card, optional footer. */
function SettingsSection({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.sectionContent}>{children}</View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

/** A grouped-list row with an icon, label, optional subtitle and chevron. */
function SettingsRow({
  icon,
  label,
  subtitle,
  onPress,
  showChevron = true,
  destructive = false,
  last = false,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  showChevron?: boolean;
  destructive?: boolean;
  last?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${label}, ${subtitle}` : label}
    >
      <Icon
        name={icon}
        size={iconSize.md}
        color={destructive ? t.status.negative.text : t.brand.tint}
        style={styles.rowIcon}
      />
      <View style={[styles.rowBody, !last && styles.rowDivider]}>
        <View style={styles.rowContent}>
          <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>{label}</Text>
          {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
        </View>
        {showChevron && (
          <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
        )}
      </View>
    </Pressable>
  );
}

/** Dialog button: secondary (Cancel) or destructive primary (style guide §13.1, §13.9). */
function DialogButton({
  label,
  onPress,
  destructive = false,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.modalButton,
        destructive ? styles.modalButtonDestructive : styles.modalButtonSecondary,
        pressed && (destructive ? styles.modalButtonDestructivePressed : styles.modalButtonSecondaryPressed),
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={destructive ? t.destructive.onFill : t.brand.tint} />
      ) : (
        <Text style={destructive ? styles.modalButtonTextDestructive : styles.modalButtonTextSecondary}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

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

  // Section
  section: {
    marginBottom: space.xxl,
  },
  sectionHeader: {
    ...typography.footnote,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    paddingHorizontal: space.lg,
  },
  sectionContent: {
    marginHorizontal: layout.marginCompact,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    backgroundColor: t.surface.card,
  },
  sectionFooter: {
    ...typography.footnote,
    color: t.text.secondary,
    marginHorizontal: layout.marginCompact,
    paddingHorizontal: space.lg,
    marginTop: space.sm,
  },

  // Row
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight + space.md,
    paddingLeft: space.lg,
    backgroundColor: t.surface.card,
  },
  rowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  rowIcon: {
    marginRight: space.md,
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'stretch' as const,
    paddingVertical: space.sm,
    paddingRight: space.md,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  rowContent: {
    flex: 1,
    marginRight: space.sm,
  },
  rowLabel: {
    ...typography.body,
    color: t.text.primary,
  },
  rowLabelDestructive: {
    color: t.status.negative.text,
  },
  rowSubtitle: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },

  // Option pickers (appearance, brand)
  optionGroup: {
    flexDirection: 'row' as const,
    padding: space.lg,
    gap: space.sm,
  },
  option: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: space.lg,
    paddingHorizontal: space.xs,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
  },
  optionSelected: {
    backgroundColor: t.brand.subtle,
    borderColor: t.brand.tint,
    borderWidth: 2,
  },
  optionPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  optionIcon: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: space.sm,
    backgroundColor: t.background.grouped,
  },
  optionIconSelected: {
    backgroundColor: t.brand.fill,
  },
  optionLabelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xxs,
  },
  optionLabel: {
    ...typography.footnote,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  optionLabelSelected: {
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  brandSwatches: {
    flexDirection: 'row' as const,
    gap: space.xs,
    marginBottom: space.sm,
  },
  brandSwatch: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.separator,
  },

  // Footer
  footer: {
    alignItems: 'center' as const,
    paddingVertical: space.xxxl,
  },
  footerTitle: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  footerSubtitle: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  // Dialogs
  modalOverlay: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxl,
    backgroundColor: t.overlay.scrim,
  },
  modalDialog: {
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    borderRadius: radius.card,
    padding: space.xxl,
    alignItems: 'center' as const,
    gap: space.sm,
    backgroundColor: t.surface.sheet,
    ...t.shadow[4],
  },
  modalTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  modalMessage: {
    ...typography.body,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.md,
  },
  modalMessageLeft: {
    textAlign: 'left' as const,
    alignSelf: 'stretch' as const,
  },
  modalActions: {
    flexDirection: 'row' as const,
    gap: space.sm,
    width: '100%' as const,
    marginTop: space.sm,
  },
  modalButton: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.sm,
  },
  modalButtonSecondary: {
    borderWidth: 1,
    borderColor: t.border.button,
  },
  modalButtonSecondaryPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  modalButtonDestructive: {
    backgroundColor: t.destructive.fill,
  },
  modalButtonDestructivePressed: {
    backgroundColor: t.destructive.fillPressed,
  },
  modalButtonTextSecondary: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  modalButtonTextDestructive: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.destructive.onFill,
    textAlign: 'center' as const,
  },
  disabled: {
    opacity: t.interaction.disabledOpacity,
  },

  // Delete Account Modal
  deleteConfirmInput: {
    ...typography.body,
    width: '100%' as const,
    minHeight: touchTarget,
    borderRadius: radius.field,
    borderWidth: 1,
    paddingHorizontal: space.md,
    backgroundColor: t.surface.field,
    borderColor: t.border.field,
    color: t.text.primary,
  },
  deleteConfirmInputFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
  },
  deleteConfirmInputError: {
    borderWidth: 2,
    borderColor: t.status.negative.border,
  },
  deleteErrorRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    alignSelf: 'stretch' as const,
    gap: space.xs,
  },
  deleteErrorText: {
    ...typography.footnote,
    flex: 1,
    color: t.status.negative.text,
  },
});

export default SettingsScreen;
