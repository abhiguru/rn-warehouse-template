/**
 * User Edit Screen - Admin User Management
 *
 * Allows supervisors and admins to:
 * - View user details (read-only: name, mobile)
 * - Change user role
 * - Toggle active/inactive status
 * - Manage customer assignments
 */

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { Text } from 'react-native-paper';
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
import { FIORI } from '@/components/common/overview-tab/FioriTokens';
import { useAppSelector } from '@/store/hooks';
import { RolePickerBottomSheet } from '@/components/RolePickerBottomSheet';
import { SearchableBottomSheet } from '@/components/common';
import { useListColors } from '@/hooks/useListColors';

// =============================================================================
// ROLE BADGE COLORS
// =============================================================================

const ROLE_COLORS: Record<UserRole, { bg: string; text: string }> = {
  admin: { bg: '#fff4e6', text: '#f69000' },
  supervisor: { bg: '#e8f4f4', text: '#1c5858' },
  staff: { bg: '#f0f0f0', text: '#7e8e9d' },
  customer: { bg: '#e8f4f4', text: '#53b1b1' },
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
  const colors = useListColors();

  // Dynamic styles for dark mode
  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        gestureContainer: {
          flex: 1,
        },
        container: {
          flex: 1,
          backgroundColor: colors.gray50,
        },
        centerContainer: {
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: FIORI.spacing.xxl,
        },
        navBar: {
          backgroundColor: colors.cellBackground,
          borderBottomWidth: 1,
          borderBottomColor: colors.cellDivider,
          ...Platform.select({
            ios: {
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 2,
            },
            android: {
              elevation: 2,
            },
          }),
        },
        backButtonText: {
          ...FIORI.typography.body,
          color: colors.primary,
          marginLeft: -4,
        },
        title: {
          ...FIORI.typography.headline,
          color: colors.textPrimary,
          letterSpacing: -0.41,
          textAlign: 'center',
        },
        loadingText: {
          ...FIORI.typography.body,
          color: colors.textSecondary,
          marginTop: FIORI.spacing.md,
        },
        errorTitle: {
          ...FIORI.typography.headline,
          color: colors.statusNegative,
          marginTop: FIORI.spacing.md,
        },
        errorText: {
          ...FIORI.typography.body,
          color: colors.textSecondary,
          textAlign: 'center',
          marginTop: FIORI.spacing.sm,
        },
        retryButton: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.primary,
          paddingHorizontal: FIORI.spacing.lg,
          height: FIORI.dimensions.buttonHeight,
          borderRadius: FIORI.dimensions.buttonRadius,
          gap: FIORI.spacing.sm,
          marginTop: FIORI.spacing.lg,
        },
        retryButtonText: {
          ...FIORI.typography.button,
          color: colors.cellBackground,
        },
        card: {
          backgroundColor: colors.cellBackground,
          marginHorizontal: FIORI.spacing.lg,
          marginTop: FIORI.spacing.lg,
          borderRadius: FIORI.dimensions.cardRadius,
          padding: FIORI.dimensions.cardPadding,
          borderWidth: 1,
          borderColor: colors.cellDivider,
          ...FIORI.shadows.card,
        },
        avatar: {
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.primaryLight,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: FIORI.spacing.md,
        },
        avatarText: {
          fontSize: 28,
          fontWeight: '600',
          color: colors.primary,
        },
        userName: {
          ...FIORI.typography.headline,
          color: colors.textPrimary,
          fontSize: 20,
        },
        userMobile: {
          ...FIORI.typography.body,
          color: colors.textSecondary,
          marginTop: 4,
        },
        sectionTitle: {
          ...FIORI.typography.sectionHeader,
          color: colors.textSecondary,
          marginBottom: FIORI.spacing.sm,
        },
        fieldRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.cellBackground,
          borderRadius: FIORI.dimensions.cardRadius,
          padding: FIORI.dimensions.cardPadding,
          borderWidth: 1,
          borderColor: colors.cellDivider,
          minHeight: FIORI.dimensions.touchTarget + 16,
        },
        fieldRowPressed: {
          backgroundColor: colors.cellBackgroundPressed,
        },
        fieldLabel: {
          ...FIORI.typography.body,
          color: colors.textPrimary,
        },
        fieldSubLabel: {
          ...FIORI.typography.caption,
          color: colors.textSecondary,
          marginTop: 2,
        },
        helperText: {
          ...FIORI.typography.caption,
          color: colors.textTertiary,
          marginTop: FIORI.spacing.sm,
          fontStyle: 'italic',
        },
        addButtonText: {
          ...FIORI.typography.body,
          color: colors.primary,
          fontWeight: '600',
        },
        emptyAssignments: {
          alignItems: 'center',
          paddingVertical: FIORI.spacing.xl,
          backgroundColor: colors.cellBackground,
          borderRadius: FIORI.dimensions.cardRadius,
          borderWidth: 1,
          borderColor: colors.cellDivider,
        },
        emptyText: {
          ...FIORI.typography.body,
          color: colors.textSecondary,
          marginTop: FIORI.spacing.md,
        },
        emptySubText: {
          ...FIORI.typography.caption,
          color: colors.textTertiary,
          marginTop: FIORI.spacing.xs,
        },
        assignmentsList: {
          backgroundColor: colors.cellBackground,
          borderRadius: FIORI.dimensions.cardRadius,
          borderWidth: 1,
          borderColor: colors.cellDivider,
          overflow: 'hidden',
        },
        assignmentItem: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: FIORI.dimensions.cardPadding,
          paddingVertical: FIORI.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.cellDivider,
        },
        assignmentName: {
          ...FIORI.typography.body,
          color: colors.textPrimary,
          fontWeight: '500',
        },
        assignmentMeta: {
          ...FIORI.typography.caption,
          color: colors.textSecondary,
          marginTop: 2,
        },
        searchResultItem: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: FIORI.spacing.lg,
          paddingVertical: FIORI.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.cellDivider,
        },
        searchResultName: {
          ...FIORI.typography.body,
          color: colors.textPrimary,
          fontWeight: '500',
        },
        searchResultMeta: {
          ...FIORI.typography.caption,
          color: colors.textSecondary,
          marginTop: 2,
        },
        savingText: {
          ...FIORI.typography.caption,
          color: colors.textSecondary,
        },
      }),
    [colors]
  );

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
        setError(response.error || 'Failed to load user');
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
          Alert.alert('Success', `Role updated to ${newRole}`);
        } else {
          Alert.alert('Error', response.error || 'Failed to update role');
        }
      } catch (err) {
        console.error('[UserEdit] Role update error:', err);
        Alert.alert('Error', 'Failed to update role');
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
          'Deactivate User',
          `Are you sure you want to deactivate ${user.name}? They will no longer be able to access the app.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Deactivate',
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
        Alert.alert('Success', `User ${active ? 'activated' : 'deactivated'}`);
      } else {
        Alert.alert('Error', response.error || 'Failed to update status');
      }
    } catch (err) {
      console.error('[UserEdit] Status update error:', err);
      Alert.alert('Error', 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomer = useCallback(
    async (customer: CustomerSearchResult) => {
      if (!user) return;

      // Check if already assigned
      if (assignedCustomers.some((c) => c.customer_id === customer.id)) {
        Alert.alert('Already Assigned', 'This customer is already assigned.');
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
          Alert.alert('Success', `${customer.name} assigned to user`);
        } else {
          Alert.alert('Error', response.error || 'Failed to assign customer');
        }
      } catch (err) {
        console.error('[UserEdit] Assign customer error:', err);
        Alert.alert('Error', 'Failed to assign customer');
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
        'Remove Customer',
        `Remove ${customerName} from this user's assignments?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
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
                  Alert.alert('Success', 'Customer removed');
                } else {
                  Alert.alert(
                    'Error',
                    response.error || 'Failed to remove customer'
                  );
                }
              } catch (err) {
                console.error('[UserEdit] Remove customer error:', err);
                Alert.alert('Error', 'Failed to remove customer');
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
    (item: CustomerSearchResult, onSelect: (item: CustomerSearchResult) => void) => (
      <Pressable
        style={dynamicStyles.searchResultItem}
        onPress={() => onSelect(item)}
      >
        <View style={styles.searchResultContent}>
          <Text style={dynamicStyles.searchResultName}>{item.name}</Text>
          {(item.mobile || item.city) && (
            <Text style={dynamicStyles.searchResultMeta}>
              {[item.mobile && `+91 ${item.mobile}`, item.city]
                .filter(Boolean)
                .join(' • ')}
            </Text>
          )}
        </View>
        <Icon name="plus-circle" size={24} color={colors.primary} />
      </Pressable>
    ),
    [colors, dynamicStyles]
  );

  // ===========================================================================
  // RENDER
  // ===========================================================================

  // Loading state
  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            headerStyle: dynamicStyles.navBar,
            headerTintColor: colors.primary,
            headerTitleAlign: 'center',
            headerLeft: () => (
              <Pressable
                onPress={() => router.back()}
                style={styles.backButton}
              >
                <Icon
                  name="chevron-left"
                  size={28}
                  color={colors.primary}
                />
                <Text style={dynamicStyles.backButtonText}>Back</Text>
              </Pressable>
            ),
            headerTitle: () => (
              <Text style={dynamicStyles.title}>Edit User</Text>
            ),
          }}
        />
        <View style={[dynamicStyles.container, dynamicStyles.centerContainer]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={dynamicStyles.loadingText}>Loading user...</Text>
        </View>
      </>
    );
  }

  // Error state
  if (error || !user) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            headerStyle: dynamicStyles.navBar,
            headerTintColor: colors.primary,
            headerTitleAlign: 'center',
            headerLeft: () => (
              <Pressable
                onPress={() => router.back()}
                style={styles.backButton}
              >
                <Icon
                  name="chevron-left"
                  size={28}
                  color={colors.primary}
                />
                <Text style={dynamicStyles.backButtonText}>Back</Text>
              </Pressable>
            ),
            headerTitle: () => (
              <Text style={dynamicStyles.title}>Edit User</Text>
            ),
          }}
        />
        <View style={[dynamicStyles.container, dynamicStyles.centerContainer]}>
          <Icon
            name="alert-circle-outline"
            size={64}
            color={colors.statusNegative}
          />
          <Text style={dynamicStyles.errorTitle}>Error</Text>
          <Text style={dynamicStyles.errorText}>{error || 'User not found'}</Text>
          <Pressable style={dynamicStyles.retryButton} onPress={loadUser}>
            <Icon name="refresh" size={20} color={colors.cellBackground} />
            <Text style={dynamicStyles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const roleColor = ROLE_COLORS[selectedRole] || ROLE_COLORS.customer;

  return (
    <GestureHandlerRootView style={dynamicStyles.gestureContainer}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: dynamicStyles.navBar,
          headerTintColor: colors.primary,
          headerTitleAlign: 'center',
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Icon
                name="chevron-left"
                size={28}
                color={colors.primary}
              />
              <Text style={dynamicStyles.backButtonText}>Back</Text>
            </Pressable>
          ),
          headerTitle: () => (
            <View style={styles.titleContainer}>
              <Text style={dynamicStyles.title}>Edit User</Text>
            </View>
          ),
        }}
      />

      <ScrollView
        style={dynamicStyles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {/* User Info Card */}
        <View style={dynamicStyles.card}>
          <View style={styles.userHeader}>
            <View style={dynamicStyles.avatar}>
              <Text style={dynamicStyles.avatarText}>
                {(user.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={dynamicStyles.userName}>{user.name || 'Unknown'}</Text>
              <Text style={dynamicStyles.userMobile}>+91 {user.mobile}</Text>
            </View>
          </View>
        </View>

        {/* Role Section */}
        <View style={styles.section}>
          <Text style={dynamicStyles.sectionTitle}>ROLE</Text>
          <Pressable
            style={({ pressed }) => [
              dynamicStyles.fieldRow,
              pressed && dynamicStyles.fieldRowPressed,
              (!canEdit || isSelfEdit) && styles.fieldRowDisabled,
            ]}
            onPress={() => {
              if (canEdit && !isSelfEdit) {
                setShowRolePicker(true);
              }
            }}
            disabled={!canEdit || isSelfEdit}
          >
            <View style={styles.fieldLeft}>
              <Icon
                name="shield-account"
                size={22}
                color={colors.textSecondary}
              />
              <Text style={dynamicStyles.fieldLabel}>User Role</Text>
            </View>
            <View style={styles.fieldRight}>
              <View
                style={[styles.roleBadge, { backgroundColor: roleColor.bg }]}
              >
                <Text style={[styles.roleBadgeText, { color: roleColor.text }]}>
                  {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}
                </Text>
              </View>
              {canEdit && !isSelfEdit && (
                <Icon
                  name="chevron-right"
                  size={20}
                  color={colors.textTertiary}
                />
              )}
            </View>
          </Pressable>
          {isSelfEdit && (
            <Text style={dynamicStyles.helperText}>
              You cannot change your own role
            </Text>
          )}
          {!canEdit && !isSelfEdit && (
            <Text style={dynamicStyles.helperText}>
              Supervisors cannot modify admin users
            </Text>
          )}
        </View>

        {/* Status Section */}
        <View style={styles.section}>
          <Text style={dynamicStyles.sectionTitle}>STATUS</Text>
          <View
            style={[
              dynamicStyles.fieldRow,
              (!canEdit || isSelfEdit) && styles.fieldRowDisabled,
            ]}
          >
            <View style={styles.fieldLeft}>
              <Icon
                name={isActive ? 'account-check' : 'account-off'}
                size={22}
                color={isActive ? colors.success : colors.statusNegative}
              />
              <View>
                <Text style={dynamicStyles.fieldLabel}>Account Status</Text>
                <Text style={dynamicStyles.fieldSubLabel}>
                  {isActive
                    ? 'User can access the app'
                    : 'User cannot access the app'}
                </Text>
              </View>
            </View>
            <Switch
              value={isActive}
              onValueChange={handleStatusToggle}
              disabled={!canEdit || isSelfEdit || saving}
              trackColor={{
                false: colors.cellDivider,
                true: colors.success,
              }}
              thumbColor={colors.cellBackground}
            />
          </View>
          {isSelfEdit && (
            <Text style={dynamicStyles.helperText}>
              You cannot deactivate your own account
            </Text>
          )}
        </View>

        {/* Customer Assignments Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={dynamicStyles.sectionTitle}>CUSTOMER ASSIGNMENTS</Text>
            {canEdit && (
              <Pressable
                style={styles.addButton}
                onPress={() => setShowCustomerSearch(true)}
                disabled={saving}
              >
                <Icon name="plus" size={20} color={colors.primary} />
                <Text style={dynamicStyles.addButtonText}>Add</Text>
              </Pressable>
            )}
          </View>

          {assignedCustomers.length === 0 ? (
            <View style={dynamicStyles.emptyAssignments}>
              <Icon
                name="account-multiple-outline"
                size={48}
                color={colors.textTertiary}
              />
              <Text style={dynamicStyles.emptyText}>No customers assigned</Text>
              {canEdit && (
                <Text style={dynamicStyles.emptySubText}>
                  Tap "Add" to assign customers to this user
                </Text>
              )}
            </View>
          ) : (
            <View style={dynamicStyles.assignmentsList}>
              {assignedCustomers.map((customer) => (
                <View key={customer.customer_id} style={dynamicStyles.assignmentItem}>
                  <View style={styles.assignmentContent}>
                    <Text style={dynamicStyles.assignmentName}>
                      {customer.customer_name}
                    </Text>
                    {(customer.customer_mobile || customer.customer_city) && (
                      <Text style={dynamicStyles.assignmentMeta}>
                        {[
                          customer.customer_mobile &&
                            `+91 ${customer.customer_mobile}`,
                          customer.customer_city,
                        ]
                          .filter(Boolean)
                          .join(' • ')}
                      </Text>
                    )}
                  </View>
                  {canEdit && (
                    <Pressable
                      style={styles.removeButton}
                      onPress={() =>
                        handleRemoveCustomer(
                          customer.customer_id,
                          customer.customer_name
                        )
                      }
                      disabled={saving}
                    >
                      <Icon
                        name="close-circle"
                        size={24}
                        color={colors.statusNegative}
                      />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Saving Indicator */}
        {saving && (
          <View style={styles.savingOverlay}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={dynamicStyles.savingText}>Saving...</Text>
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
        title="Add Customer"
        placeholder="Search customers by name..."
        searchFn={searchCustomers}
        renderItem={renderCustomerSearchItem}
        keyExtractor={(item) => item.id}
        emptyInitialText="Search for a customer"
        emptySubText="Type at least 2 characters to search"
      />
    </GestureHandlerRootView>
  );
}

// =============================================================================
// STATIC STYLES (Layout only - colors in dynamicStyles)
// =============================================================================

const styles = StyleSheet.create({
  // Header
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI.dimensions.touchTarget,
    paddingRight: FIORI.spacing.sm,
    marginLeft: -FIORI.spacing.sm,
  },
  titleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // User Header
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },

  // Sections
  section: {
    marginTop: FIORI.spacing.xl,
    marginHorizontal: FIORI.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: FIORI.spacing.sm,
  },

  // Field Row
  fieldRowDisabled: {
    opacity: 0.7,
  },
  fieldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.md,
    flex: 1,
  },
  fieldRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.sm,
  },

  // Role Badge
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Add Button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // Assignments
  assignmentContent: {
    flex: 1,
  },
  removeButton: {
    width: FIORI.dimensions.touchTarget,
    height: FIORI.dimensions.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search Result
  searchResultContent: {
    flex: 1,
  },

  // Saving Overlay
  savingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: FIORI.spacing.md,
    gap: FIORI.spacing.sm,
  },
});
