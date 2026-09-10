/**
 * Profile Screen - SAP Fiori for iOS Design
 *
 * Implements SAP Fiori profile/detail pattern
 * @see https://www.sap.com/design-system/fiori-design-ios/
 * @see design/sap-fiori-specs/01-object-cell.md
 * @see design/sap-fiori-specs/21-key-value-table-view-cell.md
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
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { logout } from '@/store/slices/authSlice';
import { useFioriColors } from '@/theme/fioriColors';
import { useTheme } from '@/hooks/useTheme';

// Static design tokens (typography, spacing, dimensions)
const FIORI_STATIC = {
  typography: {
    largeTitle: {
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
    title2: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700' as const,
      letterSpacing: 0.35,
    },
    title3: {
      fontSize: 20,
      lineHeight: 25,
      fontWeight: '600' as const,
      letterSpacing: 0.38,
    },
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
    callout: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '400' as const,
      letterSpacing: -0.32,
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
    caption1: {
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
  },
  dimensions: {
    rowHeight: 44,
    avatarSize: 80,
    iconSize: 22,
    borderRadius: 10,
    cardRadius: 12,
    modalRadius: 14,
    buttonHeight: 44,
  },
};

const UserProfileScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const { user, userProfile } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const FIORI = useFioriColors();
  const { isDarkMode } = useTheme();

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

  // Profile data sections
  const profileSections = [
    {
      title: 'ACCOUNT INFORMATION',
      items: [
        {
          label: 'Name',
          value: userProfile?.name || 'Not provided',
          icon: 'person-outline' as const,
        },
        {
          label: 'Phone',
          value: userProfile?.mobile || 'Not provided',
          icon: 'call-outline' as const,
        },
        {
          label: 'Role',
          value: userProfile?.role
            ? userProfile.role.charAt(0).toUpperCase() + userProfile.role.slice(1)
            : 'User',
          icon: 'shield-checkmark-outline' as const,
        },
      ],
    },
  ];

  // Key-Value Row Component
  const KeyValueRow = ({
    icon,
    label,
    value,
    valueColor,
    isLast = false,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    valueColor?: string;
    isLast?: boolean;
  }) => (
    <View style={[styles.keyValueRow, !isLast && [styles.keyValueRowDivider, { borderBottomColor: FIORI.colors.divider }]]}>
      <View style={styles.keyValueLeft}>
        <View style={[styles.keyValueIcon, { backgroundColor: FIORI.colors.backgroundSecondary }]}>
          <Ionicons name={icon} size={18} color={FIORI.colors.textSecondary} />
        </View>
        <Text style={[styles.keyValueLabel, { color: FIORI.colors.textPrimary }]}>{label}</Text>
      </View>
      <Text
        style={[styles.keyValueValue, { color: FIORI.colors.textSecondary }, valueColor && { color: valueColor }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: FIORI.colors.backgroundGrouped,
        },
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
          Profile
        </Text>
        <Pressable
          style={styles.navEditButton}
          onPress={handleEditProfile}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
        >
          <Text style={[styles.navEditText, { color: FIORI.colors.tint }]}>
            Edit
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingBottom: insets.bottom + FIORI_STATIC.spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View
          style={[styles.profileHeader, { backgroundColor: FIORI.colors.background }]}
        >
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: FIORI.colors.tint }]}>
              <Text style={styles.avatarText}>
                {(userProfile?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Pressable
              style={[styles.editAvatarButton, { backgroundColor: FIORI.colors.tint }]}
              onPress={handleEditProfile}
              accessibilityLabel="Edit profile picture"
            >
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            </Pressable>
          </View>

          <Text style={[styles.profileName, { color: FIORI.colors.textPrimary }]}>
            {userProfile?.name || 'User'}
          </Text>

          <View style={[styles.roleBadge, { backgroundColor: FIORI.colors.infoLight }]}>
            <Ionicons
              name="shield-checkmark"
              size={14}
              color={FIORI.colors.info}
              style={styles.roleBadgeIcon}
            />
            <Text style={[styles.roleText, { color: FIORI.colors.info }]}>
              {userProfile?.role
                ? userProfile.role.charAt(0).toUpperCase() +
                  userProfile.role.slice(1)
                : 'User'}
            </Text>
          </View>
        </View>

        {/* Profile Sections */}
        {profileSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={[styles.sectionHeader, { color: FIORI.colors.textSecondary }]}>{section.title}</Text>
            <View style={[styles.sectionContent, { backgroundColor: FIORI.colors.background }]}>
              {section.items.map((item, itemIndex) => (
                <KeyValueRow
                  key={itemIndex}
                  icon={item.icon}
                  label={item.label}
                  value={item.value}
                  valueColor={(item as { valueColor?: string }).valueColor}
                  isLast={itemIndex === section.items.length - 1}
                />
              ))}
            </View>
          </View>
        ))}

        {/* Quick Actions Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: FIORI.colors.textSecondary }]}>QUICK ACTIONS</Text>
          <View style={[styles.sectionContent, { backgroundColor: FIORI.colors.background }]}>
            {/* Edit Profile */}
            <Pressable
              style={({ pressed }) => [
                styles.actionRow,
                { borderBottomColor: FIORI.colors.divider },
                pressed && styles.actionRowPressed,
              ]}
              onPress={handleEditProfile}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <View style={[styles.actionIconContainer, { backgroundColor: FIORI.colors.tintLight }]}>
                <Ionicons
                  name="create-outline"
                  size={FIORI.dimensions.iconSize}
                  color={FIORI.colors.tint}
                />
              </View>
              <View style={styles.actionContent}>
                <Text style={[styles.actionLabel, { color: FIORI.colors.textPrimary }]}>Edit Profile</Text>
                <Text style={[styles.actionSubtitle, { color: FIORI.colors.textTertiary }]}>
                  Update your personal information
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={FIORI.colors.textTertiary}
              />
            </Pressable>

            {/* Sign Out */}
            <Pressable
              style={({ pressed }) => [
                styles.actionRow,
                styles.actionRowLast,
                pressed && styles.actionRowPressed,
              ]}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <View
                style={[
                  styles.actionIconContainer,
                  { backgroundColor: FIORI.colors.destructiveLight },
                ]}
              >
                <Ionicons
                  name="log-out-outline"
                  size={FIORI.dimensions.iconSize}
                  color={FIORI.colors.destructive}
                />
              </View>
              <View style={styles.actionContent}>
                <Text style={[styles.actionLabel, { color: FIORI.colors.destructive }]}>
                  Sign Out
                </Text>
                <Text style={[styles.actionSubtitle, { color: FIORI.colors.textTertiary }]}>
                  Sign out of your account
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={[styles.footerLogo, { backgroundColor: FIORI.colors.backgroundSecondary }]}>
            <Ionicons
              name="snow-outline"
              size={24}
              color={FIORI.colors.textTertiary}
            />
          </View>
          <Text style={[styles.footerTitle, { color: FIORI.colors.textSecondary }]}>{process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager'}</Text>
          <Text style={[styles.footerSubtitle, { color: FIORI.colors.textTertiary }]}>Management System v1.0</Text>
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
          style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}
          onPress={() => !loggingOut && setShowLogoutModal(false)}
        >
          <Pressable
            style={[styles.modalDialog, { backgroundColor: FIORI.colors.background }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal Icon */}
            <View style={[styles.modalIconContainer, { backgroundColor: FIORI.colors.destructiveLight }]}>
              <Ionicons
                name="log-out-outline"
                size={32}
                color={FIORI.colors.destructive}
              />
            </View>

            {/* Modal Header */}
            <Text style={[styles.modalTitle, { color: FIORI.colors.textPrimary }]}>Sign Out</Text>
            <Text style={[styles.modalMessage, { color: FIORI.colors.textSecondary }]}>
              Are you sure you want to sign out of your account?
            </Text>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: FIORI.colors.backgroundSecondary }]}
                onPress={() => setShowLogoutModal(false)}
                disabled={loggingOut}
              >
                <Text style={[styles.modalButtonTextSecondary, { color: FIORI.colors.tint }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, { backgroundColor: FIORI.colors.destructive }]}
                onPress={confirmLogout}
                disabled={loggingOut}
              >
                {loggingOut ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.modalButtonTextDestructive, { color: '#FFFFFF' }]}>Sign Out</Text>
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
    minWidth: 70,
  },

  navBackText: {
    ...FIORI_STATIC.typography.body,
    marginLeft: FIORI_STATIC.spacing.xs,
  },

  navTitle: {
    ...FIORI_STATIC.typography.headline,
  },

  navEditButton: {
    paddingVertical: FIORI_STATIC.spacing.sm,
    paddingLeft: FIORI_STATIC.spacing.md,
    minWidth: 70,
    alignItems: 'flex-end',
  },

  navEditText: {
    ...FIORI_STATIC.typography.body,
  },

  // ScrollView
  scrollView: {
    flex: 1,
  },

  // Profile Header (colors applied inline)
  profileHeader: {
    alignItems: 'center',
    paddingTop: FIORI_STATIC.spacing.lg,
    paddingBottom: FIORI_STATIC.spacing.xl,
    paddingHorizontal: FIORI_STATIC.spacing.md,
    marginBottom: FIORI_STATIC.spacing.lg,
  },

  avatarContainer: {
    position: 'relative',
    marginBottom: FIORI_STATIC.spacing.md,
  },

  avatar: {
    width: FIORI_STATIC.dimensions.avatarSize,
    height: FIORI_STATIC.dimensions.avatarSize,
    borderRadius: FIORI_STATIC.dimensions.avatarSize / 2,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },

  avatarText: {
    fontSize: 32,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  profileName: {
    ...FIORI_STATIC.typography.title2,
    marginBottom: FIORI_STATIC.spacing.sm,
  },

  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI_STATIC.spacing.sm + 4,
    paddingVertical: FIORI_STATIC.spacing.xs + 2,
    borderRadius: 16,
    marginBottom: FIORI_STATIC.spacing.sm,
  },

  roleBadgeIcon: {
    marginRight: FIORI_STATIC.spacing.xs,
  },

  roleText: {
    ...FIORI_STATIC.typography.footnote,
    fontWeight: '600',
  },

  profileEmail: {
    ...FIORI_STATIC.typography.subhead,
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

  // Key-Value Row
  keyValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: FIORI_STATIC.dimensions.rowHeight + 8,
    paddingHorizontal: FIORI_STATIC.spacing.md,
    paddingVertical: FIORI_STATIC.spacing.sm,
  },

  keyValueRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  keyValueLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  keyValueIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: FIORI_STATIC.spacing.sm,
  },

  keyValueLabel: {
    ...FIORI_STATIC.typography.body,
  },

  keyValueValue: {
    ...FIORI_STATIC.typography.body,
    textAlign: 'right',
    flex: 1,
    marginLeft: FIORI_STATIC.spacing.md,
  },

  // Action Row
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_STATIC.dimensions.rowHeight + 16,
    paddingHorizontal: FIORI_STATIC.spacing.md,
    paddingVertical: FIORI_STATIC.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  actionRowPressed: {
    opacity: 0.7,
  },

  actionRowLast: {
    borderBottomWidth: 0,
  },

  actionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: FIORI_STATIC.spacing.sm,
  },

  actionIconDestructive: {
    // Color applied inline
  },

  actionContent: {
    flex: 1,
    marginRight: FIORI_STATIC.spacing.sm,
  },

  actionLabel: {
    ...FIORI_STATIC.typography.body,
  },

  actionLabelDestructive: {
    // Color applied inline
  },

  actionSubtitle: {
    ...FIORI_STATIC.typography.footnote,
    marginTop: 2,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: FIORI_STATIC.spacing.xl,
  },

  footerLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: FIORI_STATIC.spacing.sm,
  },

  footerTitle: {
    ...FIORI_STATIC.typography.subhead,
    fontWeight: '600',
    marginBottom: FIORI_STATIC.spacing.xs,
  },

  footerSubtitle: {
    ...FIORI_STATIC.typography.footnote,
  },

  // Modal
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

  modalButtonSecondary: {
    // Color applied inline
  },

  modalButtonDestructive: {
    // Color applied inline
  },

  modalButtonTextSecondary: {
    ...FIORI_STATIC.typography.headline,
  },

  modalButtonTextDestructive: {
    ...FIORI_STATIC.typography.headline,
  },
});

export default UserProfileScreen;
