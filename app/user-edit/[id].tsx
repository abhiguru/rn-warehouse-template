/**
 * User Edit Screen - Admin User Management (style guide §14.4)
 *
 * Allows supervisors and admins to:
 * - View user details (read-only: name, mobile)
 * - Change user role
 * - Toggle active/inactive status
 * - Manage customer assignments
 */

import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { adminUserService } from '@/services/admin-user-service';
import { customerService } from '@/services/customer-service';
import {
  UserDetails,
  UserRole,
  UserDetailsCustomer,
} from '@/types/user.types';
import { useAppSelector } from '@/store/hooks';
import { RolePickerBottomSheet } from '@/components/RolePickerBottomSheet';
import { SearchableBottomSheet } from '@/components/common/SearchableBottomSheet';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { Button } from '@/components/ui/Button';
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
import { Avatar, SectionHeader, StatusTag } from '@/components/ui';
import { formatMobile } from '@/utils/formatters';

import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { t as tr, type TranslationKey } from '@/i18n';
import { roleLabel as roleName } from '@/utils/roleLabel';
import { serverText } from '@/utils/serverText';
import { publishUserListChange } from '@/utils/userListSync';
import { normalizeRole, userManagementActions, userPageKind } from '@/config/roles';

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

/** Why the user could not be opened. The first four end the page (Back to Users); the others offer Try again. */
type LoadFailure = 'permission' | 'notFound' | 'noAccess' | 'invalid' | 'network' | 'other';

const loadFailureOf = (code?: string): LoadFailure =>
  code === 'PERMISSION_DENIED'
    ? 'permission'
    : code === 'NOT_FOUND'
      ? 'notFound'
      : code === 'NO_ACCESS'
        ? 'noAccess'
        : code === 'INVALID_INPUT' || code === '22P02'
          ? 'invalid'
          : code === 'NETWORK' || code === 'TIMEOUT' || code === 'TIMEOUT_NOT_SAVED'
            ? 'network'
            : 'other';

const isEndOfPage = (failure: LoadFailure): boolean =>
  failure === 'permission' || failure === 'notFound' || failure === 'noAccess' || failure === 'invalid';

type FetchResult = { ok: true; user: UserDetails } | { ok: false; failure: LoadFailure };

/** What was being done when the server refused: it decides the words for the refusal. */
type ActionKind = 'role' | 'status' | 'assign' | 'remove' | 'review' | 'disconnect';

// =============================================================================
// CUSTOMER SEARCH RESULT TYPE
// =============================================================================

/** The assign sheet lists this many customers. It asks for one more, and says so under the list only when that one comes back. */
const CUSTOMER_SEARCH_LIMIT = 20;

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
  // Saves in flight: a counter, because two assigns can run at once with the sheet open.
  const [savingCount, setSavingCount] = useState(0);
  const saving = savingCount > 0;
  const startSaving = useCallback(() => setSavingCount((n) => n + 1), []);
  const stopSaving = useCallback(() => setSavingCount((n) => Math.max(0, n - 1)), []);
  const [loadFailure, setLoadFailure] = useState<LoadFailure | null>(null);

  // Edit state
  const [selectedRole, setSelectedRole] = useState<UserRole>('customer');
  const [isActive, setIsActive] = useState(true);
  const [assignedCustomers, setAssignedCustomers] = useState<
    UserDetailsCustomer[]
  >([]);

  // Bottom sheet state
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  // What the caller may do to this user: the server's rules (src/config/roles.ts), so
  // no control is shown that the server would refuse.
  const callerRole = (userProfile?.role || 'customer') as 'admin' | 'supervisor';
  const targetId = user?.id ?? userId ?? '';
  const isSelfEdit = !!userProfile?.id && userProfile.id === targetId;
  const { canEdit, canChangeAssignments, assignableRoles, needsAdministrator, assignmentsApply, assignmentsNeedActivation } = userManagementActions(
    { id: userProfile?.id, role: userProfile?.role },
    {
      id: targetId,
      role: user?.role,
      active: user?.active,
      enrollmentStatus: user?.enrollment_status,
      deleted: user?.is_deleted,
    }
  );
  const isAdminCaller = normalizeRole(userProfile?.role) === 'admin';
  // A supervisor deactivates a user but cannot activate one again (backend migration 47).
  const deactivationIsFinalForCaller = normalizeRole(userProfile?.role) === 'supervisor';

  // ===========================================================================
  // LOAD USER DETAILS
  // ===========================================================================

  const applyUser = useCallback((details: UserDetails) => {
    setUser(details);
    setSelectedRole(details.role);
    setIsActive(details.active);
    setAssignedCustomers(details.assigned_customers);
    setLoadFailure(null);
  }, []);

  const fetchDetails = useCallback(async (): Promise<FetchResult> => {
    // A route without an id has nothing to load: say so instead of spinning.
    if (!userId) return { ok: false, failure: 'notFound' };
    try {
      const response = await adminUserService.getUserDetails(userId);
      if (response.success && response.data) return { ok: true, user: response.data };
      return { ok: false, failure: loadFailureOf(response.code) };
    } catch (err) {
      console.error('[UserEdit] Load error:', err);
      return { ok: false, failure: 'network' };
    }
  }, [userId]);

  const loadUser = useCallback(async () => {
    setLoading(true);
    setLoadFailure(null);
    const result = await fetchDetails();
    if (result.ok) applyUser(result.user);
    else setLoadFailure(result.failure);
    setLoading(false);
  }, [fetchDetails, applyUser]);

  // Loads again without the spinner: after a refusal, and when the screen comes back into view
  // (for example from Access requests). A user who is gone or no longer allowed ends the page;
  // a failed reload keeps what is on screen.
  const reloadUser = useCallback(async (): Promise<FetchResult> => {
    const result = await fetchDetails();
    if (result.ok) applyUser(result.user);
    else if (isEndOfPage(result.failure)) setLoadFailure(result.failure);
    return result;
  }, [fetchDetails, applyUser]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void reloadUser();
      else focusedOnce.current = true;
    }, [reloadUser])
  );

  // The Users list updates this row in place when Back comes (it does not load its rows again).
  useEffect(() => {
    if (!user) return;
    publishUserListChange({
      kind: 'patch',
      id: user.id,
      patch: {
        role: user.role,
        active: user.active,
        assigned_customers_count: assignedCustomers.length,
        enrollment_status: user.enrollment_status ?? null,
        is_deleted: user.is_deleted ?? false,
      },
    });
  }, [user, assignedCustomers.length]);

  // A user who is gone or no longer allowed ends the page: the list is out of date, so it loads again
  // (whether Back is the header's or the page's button).
  useEffect(() => {
    if (loadFailure && isEndOfPage(loadFailure)) publishUserListChange({ kind: 'refresh' });
  }, [loadFailure]);

  const backToUsers = useCallback(() => {
    publishUserListChange({ kind: 'refresh' });
    if (router.canGoBack()) router.back();
    else router.replace('/users');
  }, []);

  /**
   * A refused change: the user is loaded again, then the reason is said in words for this
   * refusal (by the server's code), and the person is sent back when they may no longer manage users.
   */
  const refuse = useCallback(async (
    title: string,
    response: { error?: string; code?: string },
    kind: ActionKind,
    customerName?: string
  ) => {
    const code = response.code;
    // A connection failure says so at once; the reload runs behind the alert.
    const connectionFailure = code === 'NETWORK' || code === 'TIMEOUT' || code === 'TIMEOUT_NOT_SAVED';
    if (connectionFailure) {
      showAlert(title, tr(code === 'NETWORK' ? 'errors.parsed.network' : code === 'TIMEOUT' ? 'errors.parsed.timeoutWriteForm' : 'errors.parsed.timeoutNotSaved'));
      void reloadUser();
      return;
    }
    const reloaded = await reloadUser();
    const name = user?.name || tr('users.thisUser');
    const supervisor = normalizeRole(userProfile?.role) === 'supervisor';
    let message: string;
    let leave = false;
    if (code === 'SELF_EDIT_FORBIDDEN') {
      message = tr(kind === 'role' ? 'users.edit.ownRole' : kind === 'status' ? 'users.edit.ownStatus' : 'users.edit.ownAssignments');
    } else if (code === 'CANNOT_MODIFY_ADMIN') message = tr('users.edit.administratorNow', { name });
    else if (code === 'CANNOT_PROMOTE_TO_ADMIN') message = tr('users.rolePicker.adminOnly');
    else if (code === 'PERMISSION_DENIED' && kind === 'disconnect') message = tr('users.edit.disconnectAdminOnly');
    else if (code === 'PERMISSION_DENIED' && kind === 'review') message = tr('users.edit.reviewAdminOnly');
    else if (code === 'PERMISSION_DENIED') {
      const nowAdministrator = supervisor && ((reloaded.ok && reloaded.user.role === 'admin') || (!reloaded.ok && reloaded.failure === 'permission'));
      if (nowAdministrator) message = tr('users.edit.administratorNow', { name });
      else if (supervisor && user?.is_service_account) message = tr('users.edit.disconnectAdminOnly');
      else {
        message = tr('users.edit.noLongerManage');
        leave = true;
      }
    } else if (code === 'NO_ACCESS') {
      message = tr('users.edit.noLongerManage');
      leave = true;
    } else if (code === 'NOT_FOUND') {
      // The reload says which is gone: the user (the page ends), or only what the change named.
      if (!reloaded.ok) message = tr(reloaded.failure === 'notFound' ? 'users.edit.userGone' : 'users.edit.tryAgainSoon');
      else if ((kind === 'assign' || kind === 'remove') && !reloaded.user.active) message = tr('users.edit.activateToChange', { name });
      else if (kind === 'assign') message = tr('users.edit.customerGone', { customer: customerName || tr('users.edit.thisCustomer') });
      else message = tr('users.edit.tryAgainSoon');
    } else if (code === 'ENROLLMENT_REJECTED' && kind === 'status') message = tr('users.edit.rejectedActivate', { name });
    else if (code === 'INVALID_INPUT') message = tr('users.edit.couldNotOpen');
    else if (code === 'INTERNAL_ERROR') message = tr('users.edit.tryAgainSoon');
    else if (code === 'CUSTOMER_INACTIVE') message = tr('users.edit.customerInactive', { customer: customerName || tr('users.edit.thisCustomer') });
    else if (code === 'ROLE_NOT_CUSTOMER') message = tr('users.edit.onlyCustomerRole');
    else if (code === 'ACCOUNT_DELETED') message = tr('users.edit.accountDeleted');
    else if (code === 'NOT_REJECTED') message = tr('users.edit.notRejected');
    else message = serverText(response.error, tr('users.edit.tryAgainSoon'), { write: true });
    showAlert(title, message, leave ? [{ text: tr('common.ok'), onPress: backToUsers }] : undefined);
  }, [reloadUser, user, userProfile?.role, backToUsers]);

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  const applyRole = useCallback(
    async (newRole: UserRole) => {
      if (!user) return;

      startSaving();
      try {
        const response = await adminUserService.updateUserRole(user.id, newRole);

        if (response.success) {
          // The server removes a Customer's assignments when the role changes to another.
          const removed = response.data?.removed_customer_count ?? 0;
          setSelectedRole(newRole);
          setUser((prev) => (prev ? { ...prev, role: newRole } : null));
          if (newRole !== 'customer') setAssignedCustomers([]);
          const changed = tr(ROLE_CHANGED_KEYS[newRole], { name: user.name || tr('users.thisUser') });
          showToast(removed > 0 ? `${changed} ${tr('users.edit.removedAssignmentsDone', { count: removed })}` : changed);
        } else {
          await refuse(tr('users.edit.couldNotChangeRole'), response, 'role');
        }
      } catch (err) {
        console.error('[UserEdit] Role update error:', err);
        showAlert(tr('users.edit.couldNotChangeRole'), tr('common.checkConnection'));
      } finally {
        stopSaving();
      }
    },
    [user, refuse, startSaving, stopSaving]
  );

  // A role changes what the person can see and do, so it is asked first, with what the new role means.
  const handleRoleSelect = useCallback(
    (newRole: UserRole) => {
      if (!user || newRole === user.role) return;

      const name = user.name || tr('users.thisUser');
      // Changing a Customer to another role removes their customer assignments: say how many.
      const removing = user.role === 'customer' && assignedCustomers.length > 0;
      const description = tr(`users.roleDescription.${newRole}`);
      const message = removing
        ? `${description}\n\n${tr('users.edit.removedAssignments', { count: assignedCustomers.length })}`
        : description;
      showAlert(tr(`users.edit.confirmRole.${newRole}.title`, { name }), message, [
        { text: tr('common.cancel'), style: 'cancel' },
        { text: tr(`users.edit.confirmRole.${newRole}.action`), onPress: () => applyRole(newRole) },
      ]);
    },
    [user, applyRole, assignedCustomers.length]
  );

  const handleStatusToggle = useCallback(
    async (newActive: boolean) => {
      if (!user) return;

      // Confirm deactivation
      if (!newActive) {
        showAlert(
          tr('users.edit.deactivateTitle', { name: user.name || tr('users.thisUser') }),
          tr(deactivationIsFinalForCaller ? 'users.edit.deactivateMessageSupervisor' : 'users.edit.deactivateMessage'),
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
    [user, deactivationIsFinalForCaller]
  );

  // A rejected request goes back to Access requests as a Customer request (administrators only).
  const reviewAgain = async () => {
    if (!user) return;
    startSaving();
    try {
      const response = await adminUserService.reviewEnrollmentAgain(user.id);
      if (response.success) {
        showToast(tr('users.edit.reviewAgainDone', { name: user.name || tr('users.thisUser') }));
        await reloadUser();
      } else {
        await refuse(tr('users.edit.couldNotReviewAgain'), response, 'review');
      }
    } catch {
      showAlert(tr('users.edit.couldNotReviewAgain'), tr('common.checkConnection'));
    } finally {
      stopSaving();
    }
  };

  const disconnect = async () => {
    if (!user) return;
    startSaving();
    try {
      const response = await adminUserService.updateUserStatus(user.id, false);
      if (response.success) {
        setIsActive(false);
        setUser((prev) => (prev ? { ...prev, active: false } : null));
        showToast(tr('users.edit.disconnectedMessage', { name: user.name || tr('users.thisUser') }));
      } else {
        await refuse(tr('users.edit.couldNotDisconnect'), response, 'disconnect');
      }
    } catch {
      showAlert(tr('users.edit.couldNotDisconnect'), tr('common.checkConnection'));
    } finally {
      stopSaving();
    }
  };

  const updateStatus = async (active: boolean) => {
    if (!user) return;

    startSaving();
    try {
      const response = await adminUserService.updateUserStatus(user.id, active);

      if (response.success) {
        setIsActive(active);
        setUser((prev) => (prev ? { ...prev, active } : null));
        showToast(tr(active ? 'users.edit.activatedMessage' : 'users.edit.deactivatedMessage', { name: user.name || tr('users.thisUser') }));
      } else {
        await refuse(tr('users.edit.couldNotChangeStatus'), response, 'status');
      }
    } catch (err) {
      console.error('[UserEdit] Status update error:', err);
      showAlert(tr('users.edit.couldNotChangeStatus'), tr('common.checkConnection'));
    } finally {
      stopSaving();
    }
  };

  // Customers whose assignment is on its way: a second tap on the same row must not assign it again.
  const assigningRef = useRef<Set<string>>(new Set());

  const handleAddCustomer = useCallback(
    async (customer: CustomerSearchResult) => {
      if (!user) return;
      if (assigningRef.current.has(customer.id)) return;

      // Already assigned: the row in the sheet is marked and does nothing.
      if (assignedCustomers.some((c) => c.customer_id === customer.id)) return;

      assigningRef.current.add(customer.id);
      startSaving();
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
            customer_active: true,
          };
          // Kept in the order the server lists them: by customer name, then id.
          setAssignedCustomers((prev) => {
            if (prev.some((c) => c.customer_id === customer.id)) return prev;
            return [...prev, newAssignment].sort(
              (a, b) => a.customer_name.localeCompare(b.customer_name) || a.customer_id.localeCompare(b.customer_id)
            );
          });
          showToast(tr('users.edit.assignedMessage', { name: customer.name }));
        } else {
          // The sheet stays open with its search, so the next pick is one tap.
          await refuse(tr('users.edit.couldNotAssign'), response, 'assign', customer.name);
        }
      } catch (err) {
        console.error('[UserEdit] Assign customer error:', err);
        showAlert(tr('users.edit.couldNotAssign'), tr('common.checkConnection'));
      } finally {
        assigningRef.current.delete(customer.id);
        stopSaving();
      }
    },
    [user, assignedCustomers, userProfile, refuse, startSaving, stopSaving]
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
              startSaving();
              try {
                const response = await adminUserService.removeCustomerAssignment(
                  user.mobile,
                  customerId
                );

                if (response.success) {
                  setAssignedCustomers((prev) =>
                    prev.filter((c) => c.customer_id !== customerId)
                  );
                  showToast(tr('users.edit.removedMessage', { name: customerName }));
                } else {
                  await refuse(tr('users.edit.couldNotRemove'), response, 'remove', customerName);
                }
              } catch (err) {
                console.error('[UserEdit] Remove customer error:', err);
                showAlert(tr('users.edit.couldNotRemove'), tr('common.checkConnection'));
              } finally {
                stopSaving();
              }
            },
          },
        ]
      );
    },
    [user, refuse, startSaving, stopSaving]
  );

  // ===========================================================================
  // CUSTOMER SEARCH
  // ===========================================================================

  const searchCustomers = useCallback(
    async (query: string): Promise<CustomerSearchResult[]> => {
      if (query.length < 2) return [];

      // A failed search throws: the sheet then says so and offers Try again, instead of "Nothing matches".
      const results = await customerService.searchCustomers(query, CUSTOMER_SEARCH_LIMIT + 1);
      return results.map((c) => ({
        id: c.id,
        name: c.name,
        mobile: c.mobile,
        city: c.city,
      }));
    },
    []
  );

  const renderCustomerSearchItem = useCallback(
    (item: CustomerSearchResult, onSelect: (item: CustomerSearchResult) => void) => {
      const meta = [item.mobile && formatMobile(item.mobile), item.city].filter(Boolean).join(' · ');
      // The sheet stays open between picks: a customer already assigned is marked and cannot be picked again.
      const assigned = assignedCustomers.some((c) => c.customer_id === item.id);
      return (
        <Pressable
          style={({ pressed }) => [styles.searchResultItem, pressed && !assigned && styles.rowPressed]}
          onPress={() => onSelect(item)}
          disabled={assigned}
          accessibilityRole="button"
          accessibilityState={{ disabled: assigned }}
          accessibilityLabel={
            assigned
              ? tr('users.edit.assignedLabel', { name: item.name })
              : meta
                ? tr('users.edit.assignLabelDetails', { name: item.name, details: meta })
                : tr('users.edit.assignLabel', { name: item.name })
          }
        >
          <View style={styles.flex}>
            <Text style={[styles.searchResultName, assigned && styles.textMuted]}>{item.name}</Text>
            {!!meta && <Text style={styles.searchResultMeta}>{meta}</Text>}
          </View>
          {assigned ? (
            <StatusTag status="neutral" label={tr('users.edit.assignedTag')} icon="check" />
          ) : (
            <Icon name="plus" size={iconSize.lg} color={t.brand.tint} />
          )}
        </Pressable>
      );
    },
    [styles, t, assignedCustomers]
  );

  // ===========================================================================
  // RENDER
  // ===========================================================================

  // The header is drawn here, as Edit item does, not through Stack.Screen options.
  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <HeaderBackButton />
      <Text style={styles.headerTitle} accessibilityRole="header">
        {tr('users.edit.title')}
      </Text>
      <View style={styles.headerSide} />
    </View>
  );

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        {header}
        <View
          style={[styles.flex, styles.centerContainer]}
          accessibilityRole="progressbar"
          accessibilityLabel={tr('users.edit.loading')}
        >
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.loadingText}>{tr('users.edit.loadingText')}</Text>
        </View>
      </View>
    );
  }

  // Error state. A user who is gone, or one this person may not open, ends the page with one
  // button (Back to Users, which refreshes the list); a failed load offers Try again.
  if (loadFailure || !user) {
    const failure: LoadFailure = loadFailure ?? 'notFound';
    const endText =
      failure === 'permission'
        ? tr('users.edit.cannotOpenAdmin')
        : failure === 'noAccess'
          ? tr('users.edit.noLongerManage')
          : failure === 'invalid'
            ? tr('users.edit.couldNotOpen')
            : failure === 'notFound'
              ? tr('users.edit.userGoneShort')
              : null;
    return (
      <View style={styles.container}>
        {header}
        <View style={[styles.flex, styles.centerContainer]} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.errorTitle} accessibilityRole="header">
            {tr('users.edit.errorTitle')}
          </Text>
          <Text style={styles.errorText}>{endText ?? tr(failure === 'network' ? 'common.checkConnection' : 'users.edit.tryAgainSoon')}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
            onPress={endText ? backToUsers : loadUser}
            accessibilityRole="button"
          >
            <Icon name={endText ? 'arrow-left' : 'refresh'} size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.retryButtonText}>{endText ? tr('users.edit.backToUsers') : tr('common.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const roleLabel = roleName(selectedRole);
  const displayName = user.name || tr('users.unknownUser');
  const roleLocked = !canEdit;
  const pageKind = userPageKind({ deleted: user.is_deleted, enrollmentStatus: user.enrollment_status });
  const statusTag =
    pageKind === 'deleted'
      ? { label: tr('users.tags.deleted'), status: 'neutral' as const }
      : pageKind === 'pending'
        ? { label: tr('users.tags.accessRequested'), status: 'critical' as const }
        : pageKind === 'rejected'
          ? { label: tr('users.tags.requestRejected'), status: 'negative' as const }
          : !user.active && !user.is_service_account
            ? { label: tr('common.deactivated'), status: 'neutral' as const }
            : null;
  const shownName = user.name || tr('users.thisUser');

  return (
    <View style={styles.container}>
      {header}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      >
        {/* User Info Card */}
        {(() => {
          // A connection has a placeholder number, and a deleted account has none (the Users list hides both).
          const showMobile = !user.is_service_account && pageKind !== 'deleted' && !!user.mobile;
          return (
            <View
              style={styles.card}
              accessible
              accessibilityLabel={[displayName, statusTag?.label, showMobile ? formatMobile(user.mobile) : null].filter(Boolean).join(', ')}
            >
              <View style={styles.userHeader}>
                <Avatar name={displayName} id={user.id} size="lg" style={styles.avatar} />
                <View style={styles.flex}>
                  <Text style={styles.userName}>{displayName}</Text>
                  {showMobile && <Text style={styles.userMobile}>{formatMobile(user.mobile)}</Text>}
                  {statusTag && <StatusTag status={statusTag.status} label={statusTag.label} style={styles.statusTag} />}
                </View>
              </View>
            </View>
          );
        })()}

        {user.is_service_account ? (
          // A connection (the FAS sync) is set up elsewhere: no role, status or customers to change here.
          <View style={styles.section}>
            <Text style={styles.managedText}>{tr('users.edit.managedByConnection')}</Text>
            {!isActive && <Text style={styles.managedText}>{tr('users.edit.connectionDisconnected')}</Text>}
            {isActive && !isAdminCaller && <Text style={styles.helperText}>{tr('users.edit.disconnectAdminOnly')}</Text>}
            {isActive && isAdminCaller && (
              <Button
                type="secondary"
                variant="negative"
                disabled={saving}
                onPress={() => {
                  const name = user.name || tr('users.thisUser');
                  showAlert(tr('users.edit.disconnectTitle', { name }), tr('users.edit.disconnectMessage'), [
                    { text: tr('common.cancel'), style: 'cancel' },
                    { text: tr('users.edit.disconnectAction'), style: 'destructive', onPress: () => { void disconnect(); } },
                  ]);
                }}
              >
                {tr('users.edit.disconnectAction')}
              </Button>
            )}
          </View>
        ) : pageKind !== 'normal' ? (
          // A deleted account, or an access request nobody has acted on: no role, status or customer controls.
          <View style={styles.section}>
            <Text style={styles.managedText}>
              {pageKind === 'deleted'
                ? tr('users.edit.accountDeleted')
                : pageKind === 'pending'
                  ? tr(isAdminCaller ? 'users.edit.pendingNotice' : 'users.edit.pendingNoticeSupervisor', { name: shownName })
                  : tr(isAdminCaller ? 'users.edit.rejectedNotice' : 'users.edit.rejectedNoticeSupervisor', { name: shownName })}
            </Text>
            {pageKind === 'pending' && isAdminCaller && (
              <Button type="secondary" disabled={saving} onPress={() => router.push('/enrollment-review')}>
                {tr('users.edit.openAccessRequests')}
              </Button>
            )}
            {pageKind === 'rejected' && isAdminCaller && (
              <Button type="secondary" disabled={saving} onPress={() => { void reviewAgain(); }}>
                {tr('users.edit.reviewAgain')}
              </Button>
            )}
          </View>
        ) : (
          <>
          {/* Role Section */}
          <View style={styles.section}>
            <SectionHeader title={tr('users.fields.role')} style={styles.sectionHeader} />
            <Pressable
              style={({ pressed }) => [
                styles.fieldRow,
                pressed && !roleLocked && !saving && styles.rowPressed,
              ]}
              onPress={() => {
                if (!roleLocked && !saving) {
                  setShowRolePicker(true);
                }
              }}
              disabled={roleLocked || saving}
              accessibilityRole="button"
              accessibilityLabel={tr('users.edit.roleFieldLabel', { role: roleLabel })}
              accessibilityHint={roleLocked ? undefined : tr('users.edit.rolePickerHint')}
              accessibilityState={{ disabled: roleLocked || saving }}
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
            {!canEdit && !isSelfEdit && !needsAdministrator && (
              <Text style={styles.helperText}>{tr('users.edit.supervisorLimit')}</Text>
            )}
          </View>

          {/* Status Section */}
          <View style={styles.section}>
            <SectionHeader title={tr('users.fields.status')} style={styles.sectionHeader} />
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
            {needsAdministrator && (
              <Text style={styles.helperText}>{tr('users.edit.needsAdministrator')}</Text>
            )}
          </View>

          {/* Customer Assignments Section */}
          <View style={styles.section}>
            <SectionHeader
              title={tr('users.edit.assignments')}
              style={styles.sectionHeader}
              action={
                canChangeAssignments
                  ? {
                      label: tr('common.add'),
                      onPress: () => {
                        if (!saving) setShowCustomerSearch(true);
                      },
                      disabled: saving,
                      accessibilityLabel: tr('users.edit.assignCustomer'),
                    }
                  : undefined
              }
            />

            {!assignmentsApply && <Text style={styles.helperText}>{tr('users.edit.notCustomerRole')}</Text>}
            {assignmentsNeedActivation && (
              <Text style={styles.helperText}>{tr('users.edit.activateToChange', { name: shownName })}</Text>
            )}

            {assignedCustomers.length === 0 ? (
              assignmentsApply ? (
                <View style={styles.emptyAssignments}>
                  <Icon name="account-multiple-outline" size={iconSize.xl} color={t.icon.secondary} />
                  <Text style={styles.emptyText}>{tr('users.edit.noAssignments')}</Text>
                  {canChangeAssignments && (
                    <Text style={styles.emptySubText}>{tr('users.edit.addHint')}</Text>
                  )}
                </View>
              ) : null
            ) : (
              <View style={styles.assignmentsList}>
                {assignedCustomers.map((customer, index) => {
                  const meta = [
                    customer.customer_mobile && formatMobile(customer.customer_mobile),
                    customer.customer_city,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  // A deactivated business stays in the list, tagged, so nobody wonders why it has no orders.
                  const deactivated = customer.customer_active === false;
                  return (
                    <View
                      key={customer.customer_id}
                      style={[
                        styles.assignmentItem,
                        index === assignedCustomers.length - 1 && styles.assignmentItemLast,
                      ]}
                    >
                      <View
                        style={styles.flex}
                        accessible
                        accessibilityLabel={[customer.customer_name, deactivated ? tr('common.deactivated') : null, meta].filter(Boolean).join(', ')}
                      >
                        <Text style={styles.assignmentName}>{customer.customer_name}</Text>
                        {deactivated && <StatusTag status="neutral" label={tr('common.deactivated')} style={styles.statusTag} />}
                        {!!meta && <Text style={styles.assignmentMeta}>{meta}</Text>}
                      </View>
                      {canChangeAssignments && (
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
          </>
        )}

        {/* Saving Indicator */}
        {saving && (
          <View style={styles.savingOverlay} accessibilityRole="progressbar" accessibilityLabel={tr('users.edit.saving')} accessibilityLiveRegion="polite">
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
        assignableRoles={assignableRoles}
      />

      {/* Customer Search Bottom Sheet */}
      <SearchableBottomSheet<CustomerSearchResult>
        isVisible={showCustomerSearch}
        onClose={() => setShowCustomerSearch(false)}
        onSelect={handleAddCustomer}
        title={tr('users.edit.assignCustomer')}
        placeholder={tr('users.edit.searchPlaceholder')}
        searchFn={searchCustomers}
        searchErrorText={tr('customers.search.failed')}
        renderItem={renderCustomerSearchItem}
        keyExtractor={(item) => item.id}
        emptyInitialText={tr('users.edit.searchEmpty')}
        emptySubText={tr('users.edit.searchHint')}
        keepOpenOnSelect
        resultLimit={CUSTOMER_SEARCH_LIMIT}
        limitText={tr('users.edit.searchCapped', { count: CUSTOMER_SEARCH_LIMIT })}
      />
    </View>
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
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingBottom: space.xs,
    paddingHorizontal: space.sm,
    gap: space.xs,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerTitle: {
    ...typography.headline,
    flex: 1,
    textAlign: 'center' as const,
    color: t.text.primary,
  },
  // Same width as the Back button, so the title is centred.
  headerSide: {
    width: 80,
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
    marginHorizontal: layout.marginCompact,
  },
  // SectionHeader brings its own space above; the section already has the side margin.
  sectionHeader: {
    paddingHorizontal: 0,
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
  managedText: {
    ...typography.body,
    color: t.text.secondary,
    marginTop: space.xxl,
  },
  statusTag: {
    marginTop: space.xs,
  },
  textMuted: {
    color: t.text.secondary,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.sm,
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
