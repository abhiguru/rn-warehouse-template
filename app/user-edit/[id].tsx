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
  Alert,
  Switch,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
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
          Alert.alert('Role changed', `${user.name || 'This user'} is now ${newRole === 'admin' ? 'an' : 'a'} ${newRole}.`);
        } else {
          Alert.alert("Couldn't change the role", response.error || 'Try again in a moment.');
        }
      } catch (err) {
        console.error('[UserEdit] Role update error:', err);
        Alert.alert("Couldn't change the role", 'Check your connection and try again.');
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
        Alert.alert(
          `Deactivate ${user.name}?`,
          "They won't be able to use the app until you activate them again.",
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Deactivate user',
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
        Alert.alert(active ? 'User activated' : 'User deactivated', `${user.name || 'This user'} ${active ? 'can use the app again.' : "can't use the app now."}`);
      } else {
        Alert.alert("Couldn't change the status", response.error || 'Try again in a moment.');
      }
    } catch (err) {
      console.error('[UserEdit] Status update error:', err);
      Alert.alert("Couldn't change the status", 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomer = useCallback(
    async (customer: CustomerSearchResult) => {
      if (!user) return;

      // Check if already assigned
      if (assignedCustomers.some((c) => c.customer_id === customer.id)) {
        Alert.alert('Already assigned', `${customer.name} is already assigned to this user.`);
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
          Alert.alert('Customer assigned', `${customer.name} assigned.`);
        } else {
          Alert.alert("Couldn't assign the customer", response.error || 'Try again in a moment.');
        }
      } catch (err) {
        console.error('[UserEdit] Assign customer error:', err);
        Alert.alert("Couldn't assign the customer", 'Check your connection and try again.');
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

      Alert.alert(
        `Remove ${customerName}?`,
        `${customerName} will no longer be assigned to this user.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove customer',
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
                  Alert.alert('Customer removed', `${customerName} removed.`);
                } else {
                  Alert.alert(
                    "Couldn't remove the customer",
                    response.error || 'Try again in a moment.'
                  );
                }
              } catch (err) {
                console.error('[UserEdit] Remove customer error:', err);
                Alert.alert("Couldn't remove the customer", 'Check your connection and try again.');
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
          accessibilityLabel={meta ? `Assign ${item.name}, ${meta}` : `Assign ${item.name}`}
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
      <Pressable
        onPress={() => router.back()}
        style={styles.backButton}
        hitSlop={space.sm}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Icon name="chevron-left" size={iconSize.xl} color={t.brand.tint} />
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>
    ),
    headerTitle: () => (
      <Text style={styles.title} accessibilityRole="header">
        Edit user
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
          accessibilityLabel="Loading user"
        >
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.loadingText}>Loading user…</Text>
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
            Couldn't load this user
          </Text>
          <Text style={styles.errorText}>Check your connection and try again.</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
            onPress={loadUser}
            accessibilityRole="button"
          >
            <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const roleTone = t.status[ROLE_TONE[selectedRole] ?? 'neutral'];
  const roleLabel = selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1);
  const roleLocked = !canEdit || isSelfEdit;

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Stack.Screen options={headerOptions} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      >
        {/* User Info Card */}
        <View style={styles.card} accessible accessibilityLabel={`${user.name || 'Unknown user'}, ${formatMobile(user.mobile)}`}>
          <View style={styles.userHeader}>
            <View style={[styles.avatar, { backgroundColor: t.avatar[avatarIndex(user.id, t.avatar.length)] }]}>
              <Text style={styles.avatarText}>{(user.name || 'U').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.userName}>{user.name || 'Unknown user'}</Text>
              <Text style={styles.userMobile}>{formatMobile(user.mobile)}</Text>
            </View>
          </View>
        </View>

        {/* Role Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Role</Text>
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
            accessibilityLabel={`User role, ${roleLabel}`}
            accessibilityHint={roleLocked ? undefined : 'Opens the role picker'}
            accessibilityState={{ disabled: roleLocked }}
          >
            <View style={styles.fieldLeft}>
              <Icon name="shield-account-outline" size={iconSize.md} color={t.icon.secondary} />
              <Text style={styles.fieldLabel}>User role</Text>
            </View>
            <View style={styles.fieldRight}>
              <View style={[styles.roleBadge, { backgroundColor: roleTone.background }]}>
                <Text style={[styles.roleBadgeText, { color: roleTone.text }]} maxFontSizeMultiplier={1.6}>
                  {roleLabel}
                </Text>
              </View>
              {!roleLocked && (
                <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
              )}
            </View>
          </Pressable>
          {isSelfEdit && (
            <Text style={styles.helperText}>You can't change your own role.</Text>
          )}
          {!canEdit && !isSelfEdit && (
            <Text style={styles.helperText}>Supervisors can't change administrators.</Text>
          )}
        </View>

        {/* Status Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Status</Text>
          <View style={styles.fieldRow}>
            <View style={styles.fieldLeft}>
              <Icon
                name={isActive ? 'account-check-outline' : 'account-off-outline'}
                size={iconSize.md}
                color={isActive ? t.status.positive.text : t.status.negative.text}
              />
              <View style={styles.flex}>
                <Text style={styles.fieldLabel}>{isActive ? 'Active' : 'Inactive'}</Text>
                <Text style={styles.fieldSubLabel}>
                  {isActive ? 'This user can use the app.' : "This user can't use the app."}
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
              accessibilityLabel="Account active"
              accessibilityState={{ checked: isActive, disabled: roleLocked || saving }}
            />
          </View>
          {isSelfEdit && (
            <Text style={styles.helperText}>You can't deactivate your own account.</Text>
          )}
        </View>

        {/* Customer Assignments Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInline]} accessibilityRole="header">
              Customer assignments
            </Text>
            {canEdit && (
              <Pressable
                style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
                onPress={() => setShowCustomerSearch(true)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Assign customer"
                accessibilityState={{ disabled: saving }}
              >
                <Icon name="plus" size={iconSize.md} color={t.brand.tint} />
                <Text style={styles.addButtonText}>Add</Text>
              </Pressable>
            )}
          </View>

          {assignedCustomers.length === 0 ? (
            <View style={styles.emptyAssignments}>
              <Icon name="account-multiple-outline" size={iconSize.xl} color={t.icon.secondary} />
              <Text style={styles.emptyText}>No customers assigned yet.</Text>
              {canEdit && (
                <Text style={styles.emptySubText}>Tap Add to assign customers to this user.</Text>
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
                        accessibilityLabel={`Remove ${customer.customer_name}`}
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
          <View style={styles.savingOverlay} accessibilityRole="progressbar" accessibilityLabel="Saving">
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={styles.savingText}>Saving…</Text>
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
        title="Assign customer"
        placeholder="Search customers by name"
        searchFn={searchCustomers}
        renderItem={renderCustomerSearchItem}
        keyExtractor={(item) => item.id}
        emptyInitialText="Search for a customer"
        emptySubText="Type at least 2 letters to search."
      />
    </GestureHandlerRootView>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

/** "+91 98765 43210" for a stored 10-digit (or 91-prefixed) number. */
function formatMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (digits.length !== 10) return `+91 ${digits}`;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/** Stable avatar colour index for an id (style guide §3.2). */
function avatarIndex(id: string, count: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % count;
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
  backButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingRight: space.sm,
    marginLeft: -space.sm,
  },
  backButtonText: {
    ...typography.body,
    color: t.brand.tint,
    marginLeft: -space.xs,
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
    width: layout.avatar.lg,
    height: layout.avatar.lg,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: space.md,
  },
  avatarText: {
    ...typography.title2,
    color: t.mode === 'light' ? t.text.primary : t.overlay.onImage,
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
    letterSpacing: 0.5,
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
  roleBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
  },
  roleBadgeText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
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
