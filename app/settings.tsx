/**
 * Settings Screen - SAP Fiori for iOS Design
 *
 * Implements SAP Fiori settings/profile pattern
 * @see https://www.sap.com/design-system/fiori-design-ios/
 * @see design/sap-fiori-specs/01-object-cell.md
 * @see design/sap-fiori-specs/16-switch.md
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
  Switch as RNSwitch,
  StatusBar,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { logout, deleteAccount } from '@/store/slices/authSlice';
import { useTheme } from '@/hooks/useTheme';
import { useFioriColors } from '@/theme/fioriColors';
import { ThemePreference } from '@/store/slices/themeSlice';
import { triggerMediumTap } from '@/hooks/useHaptics';

// Static design tokens (typography, spacing, dimensions)
const FIORI_STATIC = {
  typography: {
    headline: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600' as const,
      letterSpacing: -0.41,
    },
    body: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '400' as const,
      letterSpacing: -0.41,
    },
    subhead: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '400' as const,
      letterSpacing: -0.24,
    },
    footnote: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '400' as const,
      letterSpacing: -0.08,
    },
    title3: {
      fontSize: 20,
      lineHeight: 25,
      fontWeight: '600' as const,
      letterSpacing: 0.38,
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  dimensions: {
    rowHeight: 44,
    avatarSize: 60,
    iconSize: 22,
    borderRadius: 10,
    cardRadius: 12,
    modalRadius: 14,
    buttonHeight: 44,
  },
};

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

const SettingsScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const { userProfile } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'warning' | 'confirm'>('warning');
  const [deleteConfirmPhone, setDeleteConfirmPhone] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const {
    preference: themePreference,
    setPreference: setThemePreference,
    isDarkMode,
  } = useTheme();
  const FIORI = useFioriColors();

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    try {
      await dispatch(logout()).unwrap();
      router.replace('/login');
    } catch {
      Alert.alert('Error', 'Failed to sign out. Please try again.');
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
    const normalizedInputPhone = deleteConfirmPhone.replace(/\D/g, '').slice(-10);

    if (normalizedInputPhone !== normalizedUserPhone) {
      setDeleteError('Phone number does not match your account');
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
          : 'Failed to delete account. Please try again.'
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

  // Fiori Object Cell Row Component
  const ObjectCellRow = ({
    icon,
    label,
    subtitle,
    onPress,
    showChevron = true,
    destructive = false,
    rightElement,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    subtitle?: string;
    onPress?: () => void;
    showChevron?: boolean;
    destructive?: boolean;
    rightElement?: React.ReactNode;
  }) => (
    <Pressable
      style={({ pressed }) => [
        styles.objectCell,
        {
          backgroundColor: FIORI.colors.background,
          borderBottomColor: FIORI.colors.divider,
        },
        pressed && { backgroundColor: FIORI.colors.backgroundSecondary },
      ]}
      onPress={onPress}
      disabled={!onPress && !rightElement}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.objectCellIcon,
          { backgroundColor: FIORI.colors.tintLight },
          destructive && { backgroundColor: FIORI.colors.destructiveLight },
        ]}
      >
        <Ionicons
          name={icon}
          size={FIORI.dimensions.iconSize}
          color={destructive ? FIORI.colors.destructive : FIORI.colors.tint}
        />
      </View>
      <View style={styles.objectCellContent}>
        <Text
          style={[
            styles.objectCellLabel,
            { color: FIORI.colors.textPrimary },
            destructive && { color: FIORI.colors.destructive },
          ]}
        >
          {label}
        </Text>
        {subtitle && (
          <Text
            style={[
              styles.objectCellSubtitle,
              { color: FIORI.colors.textSecondary },
            ]}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {rightElement}
      {showChevron && !rightElement && (
        <Ionicons
          name="chevron-forward"
          size={20}
          color={FIORI.colors.textTertiary}
        />
      )}
    </Pressable>
  );

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, backgroundColor: FIORI.colors.backgroundGrouped },
      ]}
    >
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={FIORI.colors.background}
      />

      {/* Fiori Navigation Bar */}
      <View
        style={[
          styles.navigationBar,
          {
            backgroundColor: FIORI.colors.background,
            borderBottomColor: FIORI.colors.divider,
          },
        ]}
      >
        <Pressable
          style={styles.navBackButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={FIORI.colors.tint} />
          <Text style={[styles.navBackText, { color: FIORI.colors.tint }]}>
            Back
          </Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: FIORI.colors.textPrimary }]}>
          Settings
        </Text>
        <View style={styles.navPlaceholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + FIORI.spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* User Profile Card */}
        <Pressable
          style={({ pressed }) => [
            styles.profileCard,
            { backgroundColor: FIORI.colors.background },
            pressed && { backgroundColor: FIORI.colors.backgroundSecondary },
          ]}
          onPress={handleProfile}
          accessibilityRole="button"
          accessibilityLabel={`View profile for ${userProfile?.name || 'User'}`}
        >
          <View style={[styles.avatar, { backgroundColor: FIORI.colors.tint }]}>
            <Text style={styles.avatarText}>
              {(userProfile?.name || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text
              style={[styles.profileName, { color: FIORI.colors.textPrimary }]}
            >
              {userProfile?.name || 'User'}
            </Text>
            <Text style={[styles.profileRole, { color: FIORI.colors.tint }]}>
              {userProfile?.role
                ? userProfile.role.charAt(0).toUpperCase() +
                  userProfile.role.slice(1)
                : 'User'}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={22}
            color={FIORI.colors.textTertiary}
          />
        </Pressable>

        {/* App Features Section */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionHeader, { color: FIORI.colors.textSecondary }]}
          >
            APP FEATURES
          </Text>
          <View
            style={[
              styles.sectionContent,
              { backgroundColor: FIORI.colors.background },
            ]}
          >
            {canManageCustomers && (
              <ObjectCellRow
                icon="people-outline"
                label="Customers"
                subtitle="Manage customer accounts"
                onPress={handleCustomers}
              />
            )}
            {canManageItems && (
              <ObjectCellRow
                icon="cube-outline"
                label="Items"
                subtitle="Manage inventory items"
                onPress={handleItems}
              />
            )}
            {canManageUsers && (
              <ObjectCellRow
                icon="person-circle-outline"
                label="Users"
                subtitle="Manage user accounts"
                onPress={handleUsers}
              />
            )}
            {canAccessItemPricing && (
              <ObjectCellRow
                icon="pricetag-outline"
                label="Item Pricing"
                subtitle="View and manage prices"
                onPress={handleItemPricing}
              />
            )}
            <ObjectCellRow
              icon="thermometer-outline"
              label="Temperature & Humidity"
              subtitle="Monitor sensor data"
              onPress={handleSensors}
            />
          </View>
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionHeader, { color: FIORI.colors.textSecondary }]}
          >
            APPEARANCE
          </Text>
          <View
            style={[
              styles.sectionContent,
              { backgroundColor: FIORI.colors.background },
            ]}
          >
            <View style={styles.themeSelector}>
              {THEME_OPTIONS.map((option) => {
                const isSelected = themePreference === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.themeOption,
                      { backgroundColor: FIORI.colors.backgroundGrouped },
                      isSelected && { backgroundColor: FIORI.colors.tintLight },
                    ]}
                    onPress={() => setThemePreference(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${option.label} theme`}
                  >
                    <View
                      style={[
                        styles.themeIconContainer,
                        { backgroundColor: FIORI.colors.background },
                        isSelected && { backgroundColor: FIORI.colors.tint },
                      ]}
                    >
                      <Ionicons
                        name={option.icon}
                        size={24}
                        color={
                          isSelected
                            ? FIORI.colors.iconOnPrimary
                            : FIORI.colors.textPrimary
                        }
                      />
                    </View>
                    <Text
                      style={[
                        styles.themeLabel,
                        { color: FIORI.colors.textPrimary },
                        isSelected && { color: FIORI.colors.tint },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.themeHint, { color: FIORI.colors.textTertiary }]}>
              {themePreference === 'system'
                ? `Currently using ${isDarkMode ? 'dark' : 'light'} mode based on system settings`
                : `Using ${themePreference} mode`}
            </Text>
          </View>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionHeader, { color: FIORI.colors.textSecondary }]}
          >
            LEGAL
          </Text>
          <View
            style={[
              styles.sectionContent,
              { backgroundColor: FIORI.colors.background },
            ]}
          >
            <ObjectCellRow
              icon="document-text-outline"
              label="Terms of Service"
              subtitle="View terms and conditions"
              onPress={() => router.push('/terms-of-service')}
            />
            <ObjectCellRow
              icon="shield-checkmark-outline"
              label="Privacy Policy"
              subtitle="How we handle your data"
              onPress={() => router.push('/privacy-policy')}
            />
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionHeader, { color: FIORI.colors.textSecondary }]}
          >
            ACCOUNT
          </Text>
          <View
            style={[
              styles.sectionContent,
              { backgroundColor: FIORI.colors.background },
            ]}
          >
            <ObjectCellRow
              icon="log-out-outline"
              label="Sign Out"
              onPress={handleLogout}
              showChevron={false}
              destructive
            />
            <ObjectCellRow
              icon="trash-outline"
              label="Delete Account"
              subtitle="Permanently delete your account and data"
              onPress={handleDeleteAccount}
              showChevron={false}
              destructive
            />
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text
            style={[styles.footerTitle, { color: FIORI.colors.textSecondary }]}
          >
            {process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager'}
          </Text>
          <Text
            style={[styles.footerSubtitle, { color: FIORI.colors.textTertiary }]}
          >
            Management System v1.0
          </Text>
        </View>
      </ScrollView>

      {/* Fiori Modal Dialog */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => !loggingOut && setShowLogoutModal(false)}
      >
        <Pressable
          style={[
            styles.modalOverlay,
            { backgroundColor: FIORI.colors.overlayBackground },
          ]}
          onPress={() => !loggingOut && setShowLogoutModal(false)}
        >
          <Pressable
            style={[
              styles.modalDialog,
              { backgroundColor: FIORI.colors.background },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal Icon */}
            <View
              style={[
                styles.modalIconContainer,
                { backgroundColor: FIORI.colors.destructiveLight },
              ]}
            >
              <Ionicons
                name="log-out-outline"
                size={32}
                color={FIORI.colors.destructive}
              />
            </View>

            {/* Modal Header */}
            <Text
              style={[styles.modalTitle, { color: FIORI.colors.textPrimary }]}
            >
              Sign Out
            </Text>
            <Text
              style={[styles.modalMessage, { color: FIORI.colors.textSecondary }]}
            >
              Are you sure you want to sign out of your account?
            </Text>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <Pressable
                style={[
                  styles.modalButton,
                  { backgroundColor: FIORI.colors.backgroundGrouped },
                ]}
                onPress={() => setShowLogoutModal(false)}
                disabled={loggingOut}
              >
                <Text
                  style={[
                    styles.modalButtonTextSecondary,
                    { color: FIORI.colors.textPrimary },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton,
                  { backgroundColor: FIORI.colors.destructive },
                ]}
                onPress={confirmLogout}
                disabled={loggingOut}
              >
                {loggingOut ? (
                  <ActivityIndicator
                    size="small"
                    color={FIORI.colors.iconOnPrimary}
                  />
                ) : (
                  <Text
                    style={[
                      styles.modalButtonTextDestructive,
                      { color: FIORI.colors.iconOnPrimary },
                    ]}
                  >
                    Sign Out
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => !deletingAccount && handleDeleteCancel()}
      >
        <Pressable
          style={[
            styles.modalOverlay,
            { backgroundColor: FIORI.colors.overlayBackground },
          ]}
          onPress={() => !deletingAccount && handleDeleteCancel()}
        >
          <Pressable
            style={[
              styles.modalDialog,
              { backgroundColor: FIORI.colors.background, width: 320 },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal Icon */}
            <View
              style={[
                styles.modalIconContainer,
                { backgroundColor: FIORI.colors.destructiveLight },
              ]}
            >
              <Ionicons
                name="trash-outline"
                size={32}
                color={FIORI.colors.destructive}
              />
            </View>

            {deleteStep === 'warning' ? (
              <>
                {/* Warning Step */}
                <Text
                  style={[styles.modalTitle, { color: FIORI.colors.textPrimary }]}
                >
                  Delete Account
                </Text>
                <Text
                  style={[
                    styles.modalMessage,
                    { color: FIORI.colors.textSecondary, textAlign: 'left' },
                  ]}
                >
                  This action is permanent and cannot be undone.{'\n\n'}
                  The following will be deleted:{'\n'}
                  {'\u2022'} Your profile information{'\n'}
                  {'\u2022'} Customer assignments{'\n'}
                  {'\u2022'} App preferences and cache{'\n\n'}
                  Historical records (GRNs, dispatches) will be retained for
                  compliance.
                </Text>

                <View style={styles.modalActions}>
                  <Pressable
                    style={[
                      styles.modalButton,
                      { backgroundColor: FIORI.colors.backgroundGrouped },
                    ]}
                    onPress={handleDeleteCancel}
                  >
                    <Text
                      style={[
                        styles.modalButtonTextSecondary,
                        { color: FIORI.colors.textPrimary },
                      ]}
                    >
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.modalButton,
                      { backgroundColor: FIORI.colors.destructive },
                    ]}
                    onPress={handleDeleteProceed}
                  >
                    <Text
                      style={[
                        styles.modalButtonTextDestructive,
                        { color: FIORI.colors.iconOnPrimary },
                      ]}
                    >
                      Continue
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                {/* Confirm Step */}
                <Text
                  style={[styles.modalTitle, { color: FIORI.colors.textPrimary }]}
                >
                  Confirm Deletion
                </Text>
                <Text
                  style={[
                    styles.modalMessage,
                    { color: FIORI.colors.textSecondary },
                  ]}
                >
                  Enter your phone number to confirm account deletion.
                </Text>

                <TextInput
                  style={[
                    styles.deleteConfirmInput,
                    {
                      backgroundColor: FIORI.colors.backgroundGrouped,
                      color: FIORI.colors.textPrimary,
                      borderColor: deleteError
                        ? FIORI.colors.destructive
                        : FIORI.colors.divider,
                    },
                  ]}
                  placeholder="Phone number"
                  placeholderTextColor={FIORI.colors.textTertiary}
                  value={deleteConfirmPhone}
                  onChangeText={(text) => {
                    setDeleteConfirmPhone(text);
                    setDeleteError(null);
                  }}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  editable={!deletingAccount}
                />

                {deleteError && (
                  <Text
                    style={[
                      styles.deleteErrorText,
                      { color: FIORI.colors.destructive },
                    ]}
                  >
                    {deleteError}
                  </Text>
                )}

                <View style={styles.modalActions}>
                  <Pressable
                    style={[
                      styles.modalButton,
                      { backgroundColor: FIORI.colors.backgroundGrouped },
                    ]}
                    onPress={handleDeleteCancel}
                    disabled={deletingAccount}
                  >
                    <Text
                      style={[
                        styles.modalButtonTextSecondary,
                        { color: FIORI.colors.textPrimary },
                      ]}
                    >
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.modalButton,
                      {
                        backgroundColor: deleteConfirmPhone.length >= 10
                          ? FIORI.colors.destructive
                          : FIORI.colors.divider,
                      },
                    ]}
                    onPress={confirmDeleteAccount}
                    disabled={deletingAccount || deleteConfirmPhone.length < 10}
                  >
                    {deletingAccount ? (
                      <ActivityIndicator
                        size="small"
                        color={FIORI.colors.iconOnPrimary}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.modalButtonTextDestructive,
                          { color: FIORI.colors.iconOnPrimary },
                        ]}
                      >
                        Delete
                      </Text>
                    )}
                  </Pressable>
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
// SAP FIORI STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Container (color applied inline)
  container: {
    flex: 1,
  },

  // Navigation Bar (colors applied inline)
  navigationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: FIORI_STATIC.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  navBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: FIORI_STATIC.spacing.sm,
    paddingRight: FIORI_STATIC.spacing.md,
  },

  navBackText: {
    ...FIORI_STATIC.typography.body,
    marginLeft: FIORI_STATIC.spacing.xs,
  },

  navTitle: {
    ...FIORI_STATIC.typography.headline,
  },

  navPlaceholder: {
    width: 80,
  },

  // ScrollView
  scrollView: {
    flex: 1,
  },

  // Profile Card (colors applied inline)
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: FIORI_STATIC.spacing.md,
    marginTop: FIORI_STATIC.spacing.md,
    marginBottom: FIORI_STATIC.spacing.lg,
    padding: FIORI_STATIC.spacing.md,
    borderRadius: FIORI_STATIC.dimensions.cardRadius,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },

  avatar: {
    width: FIORI_STATIC.dimensions.avatarSize,
    height: FIORI_STATIC.dimensions.avatarSize,
    borderRadius: FIORI_STATIC.dimensions.avatarSize / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },

  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  profileInfo: {
    flex: 1,
    marginLeft: FIORI_STATIC.spacing.md,
  },

  profileName: {
    ...FIORI_STATIC.typography.headline,
    marginBottom: 2,
  },

  profileRole: {
    ...FIORI_STATIC.typography.subhead,
    fontWeight: '500',
  },

  // Section
  section: {
    marginBottom: FIORI_STATIC.spacing.lg,
  },

  sectionHeader: {
    ...FIORI_STATIC.typography.footnote,
    fontWeight: '400',
    letterSpacing: 0.5,
    marginHorizontal: FIORI_STATIC.spacing.md,
    marginBottom: FIORI_STATIC.spacing.sm,
    paddingHorizontal: FIORI_STATIC.spacing.md,
  },

  sectionContent: {
    marginHorizontal: FIORI_STATIC.spacing.md,
    borderRadius: FIORI_STATIC.dimensions.borderRadius,
    overflow: 'hidden',
  },

  // Object Cell Row (colors applied inline)
  objectCell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_STATIC.dimensions.rowHeight + 12,
    paddingHorizontal: FIORI_STATIC.spacing.md,
    paddingVertical: FIORI_STATIC.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  objectCellIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: FIORI_STATIC.spacing.sm,
  },

  objectCellContent: {
    flex: 1,
    marginRight: FIORI_STATIC.spacing.sm,
  },

  objectCellLabel: {
    ...FIORI_STATIC.typography.body,
  },

  objectCellSubtitle: {
    ...FIORI_STATIC.typography.footnote,
    marginTop: 2,
  },

  // Theme Selector (colors applied inline)
  themeSelector: {
    flexDirection: 'row',
    padding: FIORI_STATIC.spacing.md,
    gap: FIORI_STATIC.spacing.sm,
  },

  themeOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: FIORI_STATIC.spacing.md,
    borderRadius: FIORI_STATIC.dimensions.borderRadius,
  },

  themeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: FIORI_STATIC.spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
  },

  themeLabel: {
    ...FIORI_STATIC.typography.footnote,
    fontWeight: '500',
  },

  themeHint: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: FIORI_STATIC.spacing.md,
    paddingBottom: FIORI_STATIC.spacing.md,
  },

  // Switch Row (colors applied inline)
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_STATIC.dimensions.rowHeight + 12,
    paddingHorizontal: FIORI_STATIC.spacing.md,
    paddingVertical: FIORI_STATIC.spacing.sm,
  },

  switchRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: FIORI_STATIC.spacing.sm,
  },

  switchRowContent: {
    flex: 1,
    marginRight: FIORI_STATIC.spacing.sm,
  },

  switchRowLabel: {
    ...FIORI_STATIC.typography.body,
  },

  switchRowSubtitle: {
    ...FIORI_STATIC.typography.footnote,
    marginTop: 2,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: FIORI_STATIC.spacing.xl,
  },

  footerTitle: {
    ...FIORI_STATIC.typography.subhead,
    fontWeight: '600',
    marginBottom: FIORI_STATIC.spacing.xs,
  },

  footerSubtitle: {
    ...FIORI_STATIC.typography.footnote,
  },

  // Modal (colors applied inline)
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalDialog: {
    width: 300,
    borderRadius: FIORI_STATIC.dimensions.modalRadius,
    padding: FIORI_STATIC.spacing.lg,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },

  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: FIORI_STATIC.spacing.md,
  },

  modalTitle: {
    ...FIORI_STATIC.typography.title3,
    marginBottom: FIORI_STATIC.spacing.sm,
  },

  modalMessage: {
    ...FIORI_STATIC.typography.subhead,
    textAlign: 'center',
    marginBottom: FIORI_STATIC.spacing.lg,
  },

  modalActions: {
    flexDirection: 'row',
    gap: FIORI_STATIC.spacing.sm,
    width: '100%',
  },

  modalButton: {
    flex: 1,
    height: FIORI_STATIC.dimensions.buttonHeight,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalButtonTextSecondary: {
    ...FIORI_STATIC.typography.headline,
  },

  modalButtonTextDestructive: {
    ...FIORI_STATIC.typography.headline,
  },

  // Delete Account Modal
  deleteConfirmInput: {
    width: '100%',
    height: FIORI_STATIC.dimensions.buttonHeight,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: FIORI_STATIC.spacing.md,
    marginBottom: FIORI_STATIC.spacing.sm,
    ...FIORI_STATIC.typography.body,
  },

  deleteErrorText: {
    ...FIORI_STATIC.typography.footnote,
    textAlign: 'center',
    marginBottom: FIORI_STATIC.spacing.sm,
  },
});

export default SettingsScreen;
