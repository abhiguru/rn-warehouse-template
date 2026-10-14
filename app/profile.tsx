/**
 * Profile screen: the signed-in user's details and account actions, as a
 * grouped list on background.grouped (style guide §14.12).
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import {
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { avatarColors, avatarInitials } from '@/utils/avatar';
import { formatMobile } from '@/utils/formatters';
import { StatusTag } from '@/components/ui';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { t as tr } from '@/i18n';
import { roleLabel as roleName } from '@/utils/roleLabel';
import { AppVersionFooter } from '@/components/AppVersionFooter';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAccountActions } from '@/features/account/useAccountActions';

/** Roles are categories, not statuses: staff roles informative, others neutral (as in the users list). */
const ROLE_TONE: Record<string, 'informative' | 'neutral'> = {
  admin: 'informative',
  supervisor: 'informative',
  staff: 'neutral',
  customer: 'neutral',
};

const UserProfileScreen: React.FC = () => {
  const { user, userProfile } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  // The same account actions as Settings, with the same wording and cleanup (§14.8).
  const account = useAccountActions();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  // At the largest text sizes the label sits above the value so neither is squeezed.
  const stacked = useWindowDimensions().fontScale >= 1.5;

  const handleEditProfile = () => {
    // Use userProfile.id (users table) not user.id (auth table)
    const userId = userProfile?.id || userProfile?.auth_user_id || user?.id;
    if (userId) {
      router.push(`/user/edit/${userId}`);
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
      // Each fact once: the name and role are under the avatar.
      items: [
        {
          label: tr('common.mobileNumber'),
          value: userProfile?.mobile ? formatMobile(userProfile.mobile) : tr('users.profile.notProvided'),
          icon: 'phone-outline',
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
        <View style={styles.navPlaceholder} />
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
            <SectionHeader title={section.title} style={styles.sectionHeader} />
            <View style={styles.sectionContent}>
              {section.items.map((item, itemIndex) => (
                <View
                  key={item.label}
                  testID={stacked ? 'profile-row-stacked' : undefined}
                  style={[
                    styles.keyValueRow,
                    stacked && styles.keyValueRowStacked,
                    itemIndex < section.items.length - 1 && styles.keyValueRowDivider,
                  ]}
                  accessible
                  accessibilityLabel={`${item.label}, ${item.value}`}
                >
                  <View style={styles.keyValueLeft}>
                    <Icon name={item.icon} size={iconSize.md} color={t.icon.secondary} />
                    <Text style={styles.keyValueLabel}>{item.label}</Text>
                  </View>
                  <Text style={[styles.keyValueValue, stacked && styles.keyValueValueStacked]}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Actions Section */}
        <View style={styles.section}>
          <SectionHeader title={tr('users.profile.actions')} style={styles.sectionHeader} />
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

            {/* Sign out, or leave this facility and sign out of this phone (useAccountActions) */}
            {account.actions.map((action, index) => (
              <Pressable
                key={action.id}
                testID={action.testID}
                style={({ pressed }) => [
                  styles.actionRow,
                  index < account.actions.length - 1 && styles.keyValueRowDivider,
                  pressed && styles.actionRowPressed,
                ]}
                onPress={() => account.request(action.id)}
                accessibilityRole="button"
                accessibilityLabel={`${action.label}, ${action.subtitle}`}
              >
                <Icon name={action.icon} size={iconSize.md} color={action.destructive ? t.status.negative.text : t.brand.tint} />
                <View style={styles.actionContent}>
                  <Text style={[styles.actionLabel, action.destructive && styles.actionLabelNegative]}>{action.label}</Text>
                  <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <AppVersionFooter />
      </ScrollView>

      {/* Account dialog (style guide §13.9) */}
      <ConfirmDialog {...account.dialog} />
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
  // SectionHeader brings its own top padding; the section's bottom margin already spaces it.
  sectionHeader: {
    marginHorizontal: layout.marginCompact,
    paddingTop: 0,
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
  keyValueRowStacked: {
    flexDirection: 'column' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'center' as const,
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

  keyValueValueStacked: {
    flex: 0,
    marginLeft: 0,
    marginTop: space.xs,
    textAlign: 'left' as const,
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
});

export default UserProfileScreen;
