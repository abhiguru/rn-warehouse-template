/**
 * Profile screen: the signed-in user's details and account actions, as a
 * grouped list on background.grouped (style guide §14.12).
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
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { logout } from '@/store/slices/authSlice';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
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
import { avatarColors, avatarInitials } from '@/utils/avatar';
import { formatMobile } from '@/utils/formatters';
import { StatusTag } from '@/components/ui';
import { t as tr } from '@/i18n';
import { roleLabel as roleName } from '@/utils/roleLabel';

/** Roles are categories, not statuses: staff roles informative, others neutral (as in the users list). */
const ROLE_TONE: Record<string, 'informative' | 'neutral'> = {
  admin: 'informative',
  supervisor: 'informative',
  staff: 'neutral',
  customer: 'neutral',
};

const UserProfileScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const { user, userProfile } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    try {
      await dispatch(logout()).unwrap();
      router.replace('/login');
    } catch {
      showAlert(tr('auth.signOut.couldNotTitle'), tr('common.checkConnection'));
      setShowLogoutModal(false);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleEditProfile = () => {
    // Use userProfile.id (users table) not user.id (auth table)
    console.log('[Profile] handleEditProfile called');
    console.log('[Profile] userProfile:', {
      id: userProfile?.id,
      auth_user_id: userProfile?.auth_user_id,
      name: userProfile?.name
    });
    console.log('[Profile] user:', {
      id: user?.id,
      email: user?.email
    });

    const userId = userProfile?.id || userProfile?.auth_user_id || user?.id;
    console.log('[Profile] Navigating to edit with userId:', userId);

    if (userId) {
      router.push(`/user/edit/${userId}`);
    } else {
      console.log('[Profile] No user ID available for edit');
    }
  };

  // The profile avatar is larger than the shared sizes, so it uses the shared
  // colours and initials on its own circle (same person, same colour everywhere).
  const avatarTone = avatarColors(userProfile?.id ?? userProfile?.name, t);

  const roleLabel = roleName(userProfile?.role);
  const profileName = userProfile?.name || tr('users.fallbackName');

  // Profile data sections
  const profileSections: Array<{
    title: string;
    items: Array<{ label: string; value: string; icon: string }>;
  }> = [
    {
      title: tr('users.profile.accountInformation'),
      items: [
        {
          label: tr('users.fields.name'),
          value: userProfile?.name || tr('users.profile.notProvided'),
          icon: 'account-outline',
        },
        {
          label: tr('users.fields.phone'),
          value: userProfile?.mobile ? formatMobile(userProfile.mobile) : tr('users.profile.notProvided'),
          icon: 'phone-outline',
        },
        {
          label: tr('users.fields.role'),
          value: roleLabel,
          icon: 'shield-check-outline',
        },
      ],
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />

      {/* Fiori Navigation Bar */}
      <View style={styles.navigationBar}>
        <HeaderBackButton style={styles.navBackButton} />
        <Text style={styles.navTitle} accessibilityRole="header">
          {tr('users.profile.title')}
        </Text>
        <Pressable
          style={styles.navEditButton}
          onPress={handleEditProfile}
          accessibilityRole="button"
          accessibilityLabel={tr('users.profile.edit')}
        >
          <Text style={styles.navEditText}>{tr('common.edit')}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <View
              style={[styles.avatar, { backgroundColor: avatarTone.background }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={[styles.avatarText, { color: avatarTone.text }]} maxFontSizeMultiplier={1}>
                {avatarInitials(profileName)}
              </Text>
            </View>
            <Pressable
              style={styles.editAvatarButton}
              onPress={handleEditProfile}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel={tr('users.profile.edit')}
            >
              <Icon name="pencil-outline" size={iconSize.sm} color={t.brand.onFill} />
            </Pressable>
          </View>

          <Text style={styles.profileName} accessibilityRole="header">
            {profileName}
          </Text>

          <StatusTag
            status={ROLE_TONE[userProfile?.role ?? ''] ?? 'neutral'}
            label={roleLabel}
            icon={null}
            style={styles.roleTag}
          />
        </View>

        {/* Profile Sections */}
        {profileSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionHeader} accessibilityRole="header">
              {section.title}
            </Text>
            <View style={styles.sectionContent}>
              {section.items.map((item, itemIndex) => (
                <View
                  key={item.label}
                  style={[
                    styles.keyValueRow,
                    itemIndex < section.items.length - 1 && styles.keyValueRowDivider,
                  ]}
                  accessible
                  accessibilityLabel={`${item.label}, ${item.value}`}
                >
                  <View style={styles.keyValueLeft}>
                    <Icon name={item.icon} size={iconSize.md} color={t.icon.secondary} />
                    <Text style={styles.keyValueLabel}>{item.label}</Text>
                  </View>
                  <Text style={styles.keyValueValue}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader} accessibilityRole="header">
            {tr('users.profile.actions')}
          </Text>
          <View style={styles.sectionContent}>
            {/* Edit Profile */}
            <Pressable
              style={({ pressed }) => [
                styles.actionRow,
                styles.keyValueRowDivider,
                pressed && styles.actionRowPressed,
              ]}
              onPress={handleEditProfile}
              accessibilityRole="button"
              accessibilityLabel={tr('users.profile.edit')}
              accessibilityHint={tr('users.profile.editHint')}
            >
              <Icon name="pencil-outline" size={iconSize.md} color={t.brand.tint} />
              <View style={styles.actionContent}>
                <Text style={styles.actionLabel}>{tr('users.profile.edit')}</Text>
                <Text style={styles.actionSubtitle}>{tr('users.profile.editSubtitle')}</Text>
              </View>
              <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
            </Pressable>

            {/* Sign Out */}
            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel={tr('auth.signOut.action')}
            >
              <Icon name="logout" size={iconSize.md} color={t.status.negative.text} />
              <View style={styles.actionContent}>
                <Text style={[styles.actionLabel, styles.actionLabelNegative]}>{tr('auth.signOut.action')}</Text>
                <Text style={styles.actionSubtitle}>{tr('users.profile.signOutSubtitle')}</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Icon name="snowflake" size={iconSize.lg} color={t.icon.secondary} />
          <Text style={styles.footerTitle}>{process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager'}</Text>
          <Text style={styles.footerSubtitle}>{tr('settings.footer.version', { version: '1.0' })}</Text>
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
          accessibilityLabel={tr('common.cancel')}
        >
          <Pressable
            style={styles.modalDialog}
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal
            accessible={false}
          >
            <Icon name="logout" size={iconSize.xl} color={t.status.negative.text} />
            <Text style={styles.modalTitle} accessibilityRole="header">
              {tr('auth.signOut.confirmTitle')}
            </Text>
            <Text style={styles.modalMessage}>
              {tr('auth.signOut.confirmMessage')}
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalButton, styles.modalButtonSecondary, pressed && styles.modalButtonSecondaryPressed]}
                onPress={() => setShowLogoutModal(false)}
                disabled={loggingOut}
                accessibilityRole="button"
                accessibilityState={{ disabled: loggingOut }}
              >
                <Text style={styles.modalButtonTextSecondary}>{tr('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalButton, styles.modalButtonDestructive, pressed && styles.modalButtonDestructivePressed]}
                onPress={confirmLogout}
                disabled={loggingOut}
                accessibilityRole="button"
                accessibilityLabel={tr('auth.signOut.action')}
                accessibilityState={{ busy: loggingOut }}
              >
                {loggingOut ? (
                  <ActivityIndicator size="small" color={t.destructive.onFill} />
                ) : (
                  <Text style={styles.modalButtonTextDestructive}>{tr('auth.signOut.action')}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

// ============================================================================
// STYLES
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
    minWidth: 70,
  },
  navTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  navEditButton: {
    minHeight: touchTarget,
    justifyContent: 'center' as const,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    minWidth: 70,
    alignItems: 'flex-end' as const,
  },
  navEditText: {
    ...typography.body,
    color: t.brand.tint,
  },

  scrollView: {
    flex: 1,
  },

  // Profile Header
  profileHeader: {
    alignItems: 'center' as const,
    paddingTop: space.xxl,
    paddingBottom: space.xxxl,
    paddingHorizontal: space.lg,
    marginBottom: space.xxl,
    backgroundColor: t.surface.card,
  },
  avatarContainer: {
    position: 'relative' as const,
    marginBottom: space.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  avatarText: {
    ...typography.title1,
  },
  editAvatarButton: {
    position: 'absolute' as const,
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 2,
    borderColor: t.surface.card,
    backgroundColor: t.brand.fill,
  },
  profileName: {
    ...typography.title2,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginBottom: space.sm,
  },
  roleTag: {
    alignSelf: 'center' as const,
  },

  // Section (grouped list, style guide §14.12)
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

  // Key-Value Row
  keyValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: layout.rowMinHeight + space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  keyValueRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  keyValueLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
  },
  keyValueLabel: {
    ...typography.body,
    color: t.text.primary,
  },
  keyValueValue: {
    ...typography.body,
    color: t.text.secondary,
    textAlign: 'right' as const,
    flex: 1,
    marginLeft: space.lg,
  },

  // Action Row
  actionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: layout.rowMinHeight + space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: t.surface.card,
  },
  actionRowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  actionContent: {
    flex: 1,
  },
  actionLabel: {
    ...typography.body,
    color: t.text.primary,
  },
  actionLabelNegative: {
    color: t.status.negative.text,
  },
  actionSubtitle: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },

  // Footer
  footer: {
    alignItems: 'center' as const,
    paddingVertical: space.xxxl,
    gap: space.xs,
  },
  footerTitle: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
    marginTop: space.xs,
  },
  footerSubtitle: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  // Dialog
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
    marginBottom: space.lg,
  },
  modalActions: {
    flexDirection: 'row' as const,
    gap: space.sm,
    width: '100%' as const,
  },
  modalButton: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
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
  },
  modalButtonTextDestructive: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.destructive.onFill,
  },
});

export default UserProfileScreen;
