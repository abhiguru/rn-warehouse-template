/**
 * User Edit Screen - Admin User Management (style guide §14.4)
 *
 * Allows supervisors and admins to:
 * - View user details (read-only: name, mobile)
 * - Change user role
 * - Toggle active/inactive status
 * - Manage customer assignments
 */

import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { adminUserService } from '@/services/admin-user-service';
import { customerService } from '@/services/customer-service';
import {
  UserDetails,
  UserRole,
  UserDetailsCustomer,
} from '@/types/user.types';
import { useAppSelector } from '@/store/hooks';
import { RolePickerBottomSheet } from '@/components/RolePickerBottomSheet';
import { SearchableBottomSheet } from '@/components/common';
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
  trackedText,
} from '@/theme/tokens';
import { Avatar, StatusTag } from '@/components/ui';
import { formatMobile } from '@/utils/formatters';

import { showAlert } from '@/utils/alert';
import { t as tr, type TranslationKey } from '@/i18n';
import { roleLabel as roleName } from '@/utils/roleLabel';

/** "… is now an admin." is one sentence per role: the article and word order differ by language. */
const ROLE_CHANGED_KEYS: Record<UserRole, TranslationKey> = {
  admin: 'users.edit.roleChanged.admin',
  supervisor: 'users.edit.roleChanged.supervisor',
  staff: 'users.edit.roleChanged.staff',
  customer: 'users.edit.roleChanged.customer',
};
/** Roles are categories, not statuses: staff roles informative, others neutral. */
const ROLE_TONE: Record<UserRole, 'informative' | 'neutral'> = {
  admin: 'informative',
  supervisor: 'informative',
  staff: 'neutral',
  customer: 'neutral',
};

// =============================================================================
// CUSTOMER SEARCH RESULT TYPE
// =============================================================================

interface CustomerSearchResult {
  id: string;
  name: string;
  mobile?: string;
  city?: string;
}

// =============================================================================
// SCREEN COMPONENT
// =============================================================================

export default function UserEditScreen() {
  const { id: userId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAppSelector((state) => state.auth);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // State
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [selectedRole, setSelectedRole] = useState<UserRole>('customer');
  const [isActive, setIsActive] = useState(true);
  const [assignedCustomers, setAssignedCustomers] = useState<
    UserDetailsCustomer[]
  >([]);

  // Bottom sheet state
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  // Check if caller can edit this user
  const callerRole = (userProfile?.role || 'customer') as 'admin' | 'supervisor';
  const canEdit =
    callerRole === 'admin' ||
    (callerRole === 'supervisor' && user?.role !== 'admin');
  const isSelfEdit = userProfile?.id === userId;

  // ===========================================================================
  // LOAD USER DETAILS
  // ===========================================================================

  const loadUser = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await adminUserService.getUserDetails(userId);

      if (response.success && response.data) {
        setUser(response.data);
        setSelectedRole(response.data.role);
        setIsActive(response.data.active);
        setAssignedCustomers(response.data.assigned_customers);
      } else {
        setError(response.error || 'not-found');
      }
    } catch (err) {
      console.error('[UserEdit] Load error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  const handleRoleSelect = useCallback(
    async (newRole: UserRole) => {
      if (!user || newRole === user.role) return;

      setSaving(true);
      try {
        const response = await adminUserService.updateUserRole(user.id, newRole);

        if (response.success) {
          setSelectedRole(newRole);
          setUser((prev) => (prev ? { ...prev, role: newRole } : null));
          showAlert(tr('users.edit.roleChangedTitle'), tr(ROLE_CHANGED_KEYS[newRole], { name: user.name || tr('users.thisUser') }));
        } else {
          showAlert(tr('users.edit.couldNotChangeRole'), response.error || tr('users.edit.tryAgainSoon'));
        }
      } catch (err) {
        console.error('[UserEdit] Role update error:', err);
        showAlert(tr('users.edit.couldNotChangeRole'), tr('common.checkConnection'));
      } finally {
        setSaving(false);
      }
    },
    [user]
  );

  const handleStatusToggle = useCallback(
    async (newActive: boolean) => {
      if (!user) return;

      // Confirm deactivation
      if (!newActive) {
        showAlert(
          tr('users.edit.deactivateTitle', { name: user.name }),
          tr('users.edit.deactivateMessage'),
          [
            { text: tr('common.cancel'), style: 'cancel' },
            {
              text: tr('users.edit.deactivateAction'),
              style: 'destructive',
              onPress: async () => {
                await updateStatus(false);
              },
            },
          ]
        );
        return;
      }

      await updateStatus(true);
    },
    [user]
  );

  const updateStatus = async (active: boolean) => {
    if (!user) return;

    setSaving(true);
    try {
      const response = await adminUserService.updateUserStatus(user.id, active);

      if (response.success) {
        setIsActive(active);
        setUser((prev) => (prev ? { ...prev, active } : null));
        showAlert(
          tr(active ? 'users.edit.activatedTitle' : 'users.edit.deactivatedTitle'),
          tr(active ? 'users.edit.activatedMessage' : 'users.edit.deactivatedMessage', { name: user.name || tr('users.thisUser') })
        );
      } else {
        showAlert(tr('users.edit.couldNotChangeStatus'), response.error || tr('users.edit.tryAgainSoon'));
      }
    } catch (err) {
      console.error('[UserEdit] Status update error:', err);
      showAlert(tr('users.edit.couldNotChangeStatus'), tr('common.checkConnection'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomer = useCallback(
    async (customer: CustomerSearchResult) => {
      if (!user) return;

      // Check if already assigned
      if (assignedCustomers.some((c) => c.customer_id === customer.id)) {
        showAlert(tr('users.edit.alreadyAssignedTitle'), tr('users.edit.alreadyAssignedMessage', { name: customer.name }));
        return;
      }

      setSaving(true);
      try {
        const response = await adminUserService.assignCustomerToUser(
          user.mobile,
          customer.id
        );

        if (response.success) {
          // Add to local state
          const newAssignment: UserDetailsCustomer = {
            customer_id: customer.id,
            customer_name: customer.name,
            customer_mobile: customer.mobile || null,
            customer_city: customer.city || null,
            assigned_at: new Date().toISOString(),
            assigned_by_name: userProfile?.name || null,
          };
          setAssignedCustomers((prev) => [...prev, newAssignment]);
          showAlert(tr('users.edit.assignedTitle'), tr('users.edit.assignedMessage', { name: customer.name }));
        } else {
          showAlert(tr('users.edit.couldNotAssign'), response.error || tr('users.edit.tryAgainSoon'));
        }
      } catch (err) {
        console.error('[UserEdit] Assign customer error:', err);
        showAlert(tr('users.edit.couldNotAssign'), tr('common.checkConnection'));
      } finally {
        setSaving(false);
        setShowCustomerSearch(false);
      }
    },
    [user, assignedCustomers, userProfile]
  );

  const handleRemoveCustomer = useCallback(
    async (customerId: string, customerName: string) => {
      if (!user) return;

      showAlert(
        tr('users.edit.removeTitle', { name: customerName }),
        tr('users.edit.removeMessage', { name: customerName }),
        [
          { text: tr('common.cancel'), style: 'cancel' },
          {
            text: tr('users.edit.removeAction'),
            style: 'destructive',
            onPress: async () => {
              setSaving(true);
              try {
                const response = await adminUserService.removeCustomerAssignment(
                  user.mobile,
                  customerId
                );

                if (response.success) {
                  setAssignedCustomers((prev) =>
                    prev.filter((c) => c.customer_id !== customerId)
                  );
                  showAlert(tr('users.edit.removedTitle'), tr('users.edit.removedMessage', { name: customerName }));
                } else {
                  showAlert(
                    tr('users.edit.couldNotRemove'),
                    response.error || tr('users.edit.tryAgainSoon')
                  );
                }
              } catch (err) {
                console.error('[UserEdit] Remove customer error:', err);
                showAlert(tr('users.edit.couldNotRemove'), tr('common.checkConnection'));
              } finally {
                setSaving(false);
              }
            },
          },
        ]
      );
    },
    [user]
  );

  // ===========================================================================
  // CUSTOMER SEARCH
  // ===========================================================================

  const searchCustomers = useCallback(
    async (query: string): Promise<CustomerSearchResult[]> => {
      if (query.length < 2) return [];

      try {
        const results = await customerService.searchCustomers(query, 20);
        return results.map((c) => ({
          id: c.id,
          name: c.name,
          mobile: c.mobile,
          city: c.city,
        }));
      } catch (err) {
        console.error('[UserEdit] Customer search error:', err);
        return [];
      }
    },
    []
  );

  const renderCustomerSearchItem = useCallback(
    (item: CustomerSearchResult, onSelect: (item: CustomerSearchResult) => void) => {
      const meta = [item.mobile && formatMobile(item.mobile), item.city].filter(Boolean).join(' · ');
      return (
        <Pressable
          style={({ pressed }) => [styles.searchResultItem, pressed && styles.rowPressed]}
          onPress={() => onSelect(item)}
          accessibilityRole="button"
          accessibilityLabel={meta ? tr('users.edit.assignLabelDetails', { name: item.name, details: meta }) : tr('users.edit.assignLabel', { name: item.name })}
        >
          <View style={styles.flex}>
            <Text style={styles.searchResultName}>{item.name}</Text>
            {!!meta && <Text style={styles.searchResultMeta}>{meta}</Text>}
          </View>
          <Icon name="plus" size={iconSize.lg} color={t.brand.tint} />
        </Pressable>
      );
    },
    [styles, t]
  );

  // ===========================================================================
  // RENDER
  // ===========================================================================

  const headerOptions = {
    headerShown: true,
    headerStyle: { backgroundColor: t.surface.header },
    headerShadowVisible: false,
    headerTintColor: t.brand.tint,
    headerTitleAlign: 'center' as const,
    headerLeft: () => (
      <HeaderBackButton />
    ),
    headerTitle: () => (
      <Text style={styles.title} accessibilityRole="header">
        {tr('users.edit.title')}
      </Text>
    ),
  };

  // Loading state
  if (loading) {
    return (
      <>
        <Stack.Screen options={headerOptions} />
        <View
          style={[styles.container, styles.centerContainer]}
          accessibilityRole="progressbar"
          accessibilityLabel={tr('users.edit.loading')}
        >
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.loadingText}>{tr('users.edit.loadingText')}</Text>
        </View>
      </>
    );
  }

  // Error state
  if (error || !user) {
    return (
      <>
        <Stack.Screen options={headerOptions} />
        <View style={[styles.container, styles.centerContainer]} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.errorTitle} accessibilityRole="header">
            {tr('users.edit.errorTitle')}
          </Text>
          <Text style={styles.errorText}>{tr('common.checkConnection')}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
            onPress={loadUser}
            accessibilityRole="button"
          >
            <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.retryButtonText}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const roleLabel = roleName(selectedRole);
  const displayName = user.name || tr('users.unknownUser');
  const roleLocked = !canEdit || isSelfEdit;

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Stack.Screen options={headerOptions} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      >
        {/* User Info Card */}
        <View style={styles.card} accessible accessibilityLabel={`${displayName}, ${formatMobile(user.mobile)}`}>
          <View style={styles.userHeader}>
            <Avatar name={displayName} id={user.id} size="lg" style={styles.avatar} />
            <View style={styles.flex}>
              <Text style={styles.userName}>{displayName}</Text>
              <Text style={styles.userMobile}>{formatMobile(user.mobile)}</Text>
            </View>
          </View>
        </View>

        {/* Role Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">{tr('users.fields.role')}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.fieldRow,
              pressed && !roleLocked && styles.rowPressed,
            ]}
            onPress={() => {
              if (!roleLocked) {
                setShowRolePicker(true);
              }
            }}
            disabled={roleLocked}
            accessibilityRole="button"
            accessibilityLabel={tr('users.edit.roleFieldLabel', { role: roleLabel })}
            accessibilityHint={roleLocked ? undefined : tr('users.edit.rolePickerHint')}
            accessibilityState={{ disabled: roleLocked }}
          >
            <View style={styles.fieldLeft}>
              <Icon name="shield-account-outline" size={iconSize.md} color={t.icon.secondary} />
              <Text style={styles.fieldLabel}>{tr('users.edit.roleField')}</Text>
            </View>
            <View style={styles.fieldRight}>
              <StatusTag status={ROLE_TONE[selectedRole] ?? 'neutral'} label={roleLabel} icon={null} />
              {!roleLocked && (
                <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
              )}
            </View>
          </Pressable>
          {isSelfEdit && (
            <Text style={styles.helperText}>{tr('users.edit.ownRole')}</Text>
          )}
          {!canEdit && !isSelfEdit && (
            <Text style={styles.helperText}>{tr('users.edit.supervisorLimit')}</Text>
          )}
        </View>

        {/* Status Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">{tr('users.fields.status')}</Text>
          <View style={styles.fieldRow}>
            <View style={styles.fieldLeft}>
              <Icon
                name={isActive ? 'account-check-outline' : 'account-off-outline'}
                size={iconSize.md}
                color={isActive ? t.status.positive.text : t.status.negative.text}
              />
              <View style={styles.flex}>
                <Text style={styles.fieldLabel}>{tr(isActive ? 'common.active' : 'common.inactive')}</Text>
                <Text style={styles.fieldSubLabel}>
                  {tr(isActive ? 'users.edit.canUse' : 'users.edit.cannotUse')}
                </Text>
              </View>
            </View>
            <Switch
              value={isActive}
              onValueChange={handleStatusToggle}
              disabled={roleLocked || saving}
              trackColor={{ false: t.control.trackOff, true: t.status.positive.element }}
              thumbColor={t.control.thumb}
              ios_backgroundColor={t.control.trackOff}
              style={(roleLocked || saving) && styles.disabled}
              accessibilityLabel={tr('users.edit.accountActive')}
              accessibilityState={{ checked: isActive, disabled: roleLocked || saving }}
            />
          </View>
          {isSelfEdit && (
            <Text style={styles.helperText}>{tr('users.edit.ownStatus')}</Text>
          )}
        </View>

        {/* Customer Assignments Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInline]} accessibilityRole="header">
              {tr('users.edit.assignments')}
            </Text>
            {canEdit && (
              <Pressable
                style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
                onPress={() => setShowCustomerSearch(true)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={tr('users.edit.assignCustomer')}
                accessibilityState={{ disabled: saving }}
              >
                <Icon name="plus" size={iconSize.md} color={t.brand.tint} />
                <Text style={styles.addButtonText}>{tr('common.add')}</Text>
              </Pressable>
            )}
          </View>

          {assignedCustomers.length === 0 ? (
            <View style={styles.emptyAssignments}>
              <Icon name="account-multiple-outline" size={iconSize.xl} color={t.icon.secondary} />
              <Text style={styles.emptyText}>{tr('users.edit.noAssignments')}</Text>
              {canEdit && (
                <Text style={styles.emptySubText}>{tr('users.edit.addHint')}</Text>
              )}
            </View>
          ) : (
            <View style={styles.assignmentsList}>
              {assignedCustomers.map((customer, index) => {
                const meta = [
                  customer.customer_mobile && formatMobile(customer.customer_mobile),
                  customer.customer_city,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <View
                    key={customer.customer_id}
                    style={[
                      styles.assignmentItem,
                      index === assignedCustomers.length - 1 && styles.assignmentItemLast,
                    ]}
                  >
                    <View style={styles.flex} accessible accessibilityLabel={meta ? `${customer.customer_name}, ${meta}` : customer.customer_name}>
                      <Text style={styles.assignmentName}>{customer.customer_name}</Text>
                      {!!meta && <Text style={styles.assignmentMeta}>{meta}</Text>}
                    </View>
                    {canEdit && (
                      <Pressable
                        style={({ pressed }) => [styles.removeButton, pressed && styles.rowPressed]}
                        onPress={() =>
                          handleRemoveCustomer(customer.customer_id, customer.customer_name)
                        }
                        disabled={saving}
                        accessibilityRole="button"
                        accessibilityLabel={tr('users.edit.removeLabel', { name: customer.customer_name })}
                        accessibilityState={{ disabled: saving }}
                      >
                        <Icon name="close" size={iconSize.md} color={t.status.negative.text} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Saving Indicator */}
        {saving && (
          <View style={styles.savingOverlay} accessibilityRole="progressbar" accessibilityLabel={tr('users.edit.saving')}>
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={styles.savingText}>{tr('common.saving')}</Text>
          </View>
        )}
      </ScrollView>

      {/* Role Picker Bottom Sheet */}
      <RolePickerBottomSheet
        isVisible={showRolePicker}
        onClose={() => setShowRolePicker(false)}
        onSelect={handleRoleSelect}
        currentRole={selectedRole}
        callerRole={callerRole}
      />

      {/* Customer Search Bottom Sheet */}
      <SearchableBottomSheet<CustomerSearchResult>
        isVisible={showCustomerSearch}
        onClose={() => setShowCustomerSearch(false)}
        onSelect={handleAddCustomer}
        title={tr('users.edit.assignCustomer')}
        placeholder={tr('users.edit.searchPlaceholder')}
        searchFn={searchCustomers}
        renderItem={renderCustomerSearchItem}
        keyExtractor={(item) => item.id}
        emptyInitialText={tr('users.edit.searchEmpty')}
        emptySubText={tr('users.edit.searchHint')}
      />
    </GestureHandlerRootView>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const makeStyles = (t: ThemeTokens) => ({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  centerContainer: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.xxl,
    gap: space.sm,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.md,
  },
  errorTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.sm,
  },
  errorText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.md,
  },
  retryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  retryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  retryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  card: {
    backgroundColor: t.surface.card,
    marginHorizontal: layout.marginCompact,
    marginTop: space.lg,
    borderRadius: radius.card,
    padding: space.lg,
    ...t.shadow[2],
  },
  userHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  avatar: {
    marginRight: space.md,
  },
  userName: {
    ...typography.title3,
    color: t.text.primary,
  },
  userMobile: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.xs,
    fontVariant: ['tabular-nums' as const],
  },
  section: {
    marginTop: space.xxl,
    marginHorizontal: layout.marginCompact,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  sectionTitle: {
    ...typography.footnote,
    textTransform: 'uppercase' as const,
    letterSpacing: trackedText(0.5),
    color: t.text.secondary,
    marginBottom: space.sm,
  },
  sectionTitleInline: {
    marginBottom: 0,
    flex: 1,
  },
  fieldRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
    minHeight: touchTarget + space.lg,
    ...t.shadow[2],
  },
  rowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  disabled: {
    opacity: t.interaction.disabledOpacity,
  },
  fieldLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    flex: 1,
  },
  fieldRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  fieldLabel: {
    ...typography.body,
    color: t.text.primary,
  },
  fieldSubLabel: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.sm,
  },
  addButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    borderRadius: radius.button,
  },
  addButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  addButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  emptyAssignments: {
    alignItems: 'center' as const,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  emptyText: {
    ...typography.body,
    color: t.text.primary,
    marginTop: space.md,
    textAlign: 'center' as const,
  },
  emptySubText: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xs,
    textAlign: 'center' as const,
  },
  assignmentsList: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  assignmentItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    minHeight: layout.rowMinHeight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  assignmentItemLast: {
    borderBottomWidth: 0,
  },
  assignmentName: {
    ...typography.body,
    color: t.text.primary,
  },
  assignmentMeta: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  removeButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  searchResultItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
    minHeight: layout.rowMinHeight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  searchResultName: {
    ...typography.body,
    color: t.text.primary,
  },
  searchResultMeta: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  savingOverlay: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.md,
    gap: space.sm,
  },
  savingText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
});
