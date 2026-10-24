/**
 * Users screen: admin user management as a list report (style guide §14.1).
 *
 * Object cells with an avatar, role and status tags (Deactivated, Access requested, Request
 * rejected, Deleted, You) and contact details, pull to refresh, infinite scroll, and loading,
 * empty, error and no-access states. Colours come from the semantic tokens.
 *
 * Access: Admin and Supervisor roles only
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useIsFocused } from 'expo-router';
import { canOpenScreen } from '@/config/roles';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { adminUserService } from '@/services/admin-user-service';
import { UserListItem, UserFilters, UserRole } from '@/types/user.types';
import { subscribeUserListChanges } from '@/utils/userListSync';
import { LoadMoreErrorFooter } from '@/components/lists/ListLoadErrors';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { MasterListHeader } from '@/components/common/MasterListHeader';
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
import { formatCount, formatMobile, formatTime } from '@/utils/formatters';
import { normalizeUserSearch } from '@/utils/userSearch';
import { t as tr } from '@/i18n';
import { roleLabel as roleName } from '@/utils/roleLabel';

// =============================================================================
// TYPES
// =============================================================================

interface ListState {
  data: UserListItem[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  filters: UserFilters;
  offset: number;
  /** Live accounts (what the count line shows). */
  totalCount: number;
  /** Rows on the server including deleted accounts: how far paging goes. */
  totalWithDeleted: number;
  error: boolean;
  /** The server refused the list: the caller can no longer manage users. */
  noAccess: boolean;
  /** The next page failed; the rows on screen stay. */
  moreFailed: boolean;
  /** The search the rows on screen answer. */
  loadedSearch: string;
  /** When the rows on screen were loaded. */
  loadedAt: Date | null;
  /** A reload failed while rows were on screen: they are older than they look. */
  refreshFailed: boolean;
}

/** What the list draws: a person, a connection (FAS sync), or the heading above the connections. */
type ListRow = { kind: 'user'; user: UserListItem } | { kind: 'connectionsHeader' } | { kind: 'deletedHeader' };

/**
 * Rows asked for per call. The server sends no count of connections, so the screen loads
 * every row (up to MAX_ROWS) to count people and to show the Connections section in full.
 */
import { appendNew } from '@/utils/appendNew';

const PAGE_SIZE = 100;
const MAX_ROWS = 1000;

const DEFAULT_FILTERS: UserFilters = {
  search_query: '',
  active: null,
};

// =============================================================================
// SCREEN COMPONENT
// =============================================================================

export default function UsersScreen() {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAppSelector((state) => state.auth);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const [state, setState] = useState<ListState>({
    data: [],
    loading: true,
    refreshing: false,
    loadingMore: false,
    filters: DEFAULT_FILTERS,
    offset: 0,
    totalCount: 0,
    totalWithDeleted: 0,
    error: false,
    noAccess: false,
    moreFailed: false,
    loadedSearch: '',
    loadedAt: null,
    refreshFailed: false,
  });
  // Counts the loads from the first row: an answer for an older search is ignored.
  const requestRef = useRef(0);

  // Check access
  const hasAccess = canOpenScreen(userProfile?.role, 'userManagement');

  // ===========================================================================
  // FETCH LOGIC
  // ===========================================================================

  const fetchUsers = useCallback(
    async (filters: UserFilters, offset: number = 0) => {
      const request = offset === 0 ? ++requestRef.current : requestRef.current;
      const search = filters.search_query ?? '';
      if (offset === 0) {
        setState((prev) => ({ ...prev, loading: true, error: false, moreFailed: false }));
      } else {
        setState((prev) => ({ ...prev, loadingMore: true, moreFailed: false }));
      }

      const fail = (code?: string) => {
        // The caller lost the right to manage users: say so, not "Couldn't load users".
        if (code === 'PERMISSION_DENIED' || code === 'NO_ACCESS') {
          setState((prev) => ({ ...prev, data: [], totalCount: 0, totalWithDeleted: 0, loading: false, loadingMore: false, noAccess: true }));
          return;
        }
        setState((prev) => {
          // Rows for the same search stay, marked as older; rows for another search would mislead.
          const keepRows = offset === 0 ? prev.data.length > 0 && prev.loadedSearch === search : true;
          if (keepRows && prev.data.length > 0) {
            return { ...prev, loading: false, loadingMore: false, refreshFailed: offset === 0 ? true : prev.refreshFailed, moreFailed: offset > 0 };
          }
          return { ...prev, data: [], totalCount: 0, totalWithDeleted: 0, loading: false, loadingMore: false, error: true };
        });
      };

      try {
        const response = await adminUserService.getUsersList({ ...filters, search_query: normalizeUserSearch(search) }, PAGE_SIZE, offset);
        if (request !== requestRef.current) return;

        if (response.success && response.data) {
          setState((prev) => ({
            ...prev,
            data:
              offset === 0
                ? response.data!.users
                : appendNew(prev.data, response.data!.users),
            totalCount: response.data!.pagination.total_count,
            totalWithDeleted: response.data!.pagination.total_with_deleted ?? response.data!.pagination.total_count,
            noAccess: false,
            moreFailed: false,
            offset,
            loading: false,
            loadingMore: false,
            error: false,
            loadedSearch: offset === 0 ? search : prev.loadedSearch,
            loadedAt: offset === 0 ? new Date() : prev.loadedAt,
            refreshFailed: offset === 0 ? false : prev.refreshFailed,
          }));
          // More rows on the server: keep loading them (CR-26), for this search only.
          // Paging runs to the end of the rows including deleted accounts, which come last.
          const loaded = offset + response.data.users.length;
          const end = response.data.pagination.total_with_deleted ?? response.data.pagination.total_count;
          if (response.data.users.length > 0 && loaded < end && loaded < MAX_ROWS) {
            void fetchUsers(filters, loaded);
          }
        } else {
          fail(response.code);
        }
      } catch {
        if (request !== requestRef.current) return;
        fail();
      }
    },
    []
  );

  // ===========================================================================
  // EFFECTS
  // ===========================================================================

  // The rows are loaded when the list first opens (and again after a failed load). Back from a
  // user does not load them again: Edit user tells the list what it changed (userListSync).
  useEffect(() => {
    if (isFocused && hasAccess && (state.loadedAt === null || state.error)) {
      fetchUsers(state.filters, 0);
    }
  }, [isFocused, hasAccess]);

  const filtersRef = useRef(state.filters);
  filtersRef.current = state.filters;
  useEffect(
    () =>
      subscribeUserListChanges((change) => {
        if (change.kind === 'refresh') {
          void fetchUsers(filtersRef.current, 0);
          return;
        }
        setState((prev) => {
          // The count line is of live accounts: a row that became deleted (or came back) moves it by one.
          const was = prev.data.find((user) => user.id === change.id);
          const delta =
            was && change.patch.is_deleted !== undefined && !!was.is_deleted !== !!change.patch.is_deleted
              ? change.patch.is_deleted ? -1 : 1
              : 0;
          return {
            ...prev,
            totalCount: Math.max(0, prev.totalCount + delta),
            data: prev.data.map((user) => (user.id === change.id ? { ...user, ...change.patch } : user)),
          };
        });
      }),
    [fetchUsers]
  );

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  const handleRefresh = useCallback(() => {
    setState((prev) => ({ ...prev, refreshing: true, offset: 0 }));
    fetchUsers(state.filters, 0).finally(() => {
      setState((prev) => ({ ...prev, refreshing: false }));
    });
  }, [state.filters, fetchUsers]);

  const handleSearch = useCallback(
    (text: string) => {
      const filters = { ...state.filters, search_query: text };
      setState((prev) => ({ ...prev, filters, offset: 0 }));
      fetchUsers(filters, 0);
    },
    [state.filters, fetchUsers]
  );

  const handleEndReached = useCallback(() => {
    const hasMore =
      state.totalWithDeleted > state.data.length &&
      !state.loadingMore &&
      !state.loading &&
      !state.moreFailed;
    if (hasMore) {
      fetchUsers(state.filters, state.data.length);
    }
  }, [state, fetchUsers]);

  const handleEditUser = useCallback((userId: string) => {
    router.push({
      pathname: '/user-edit/[id]',
      params: { id: userId },
    });
  }, []);

  // ===========================================================================
  // RENDER
  // ===========================================================================

  // People first; connections (the FAS sync) after them under their own heading, and not counted.
  const rows = useMemo<ListRow[]>(() => {
    const deleted = state.data.filter((user) => user.is_deleted);
    const people = state.data.filter((user) => !user.is_deleted && !user.is_service_account);
    const connections = state.data.filter((user) => !user.is_deleted && user.is_service_account);
    return [
      ...people.map((user): ListRow => ({ kind: 'user', user })),
      ...(connections.length > 0 ? [{ kind: 'connectionsHeader' } as ListRow] : []),
      ...connections.map((user): ListRow => ({ kind: 'user', user })),
      ...(deleted.length > 0 ? [{ kind: 'deletedHeader' } as ListRow] : []),
      ...deleted.map((user): ListRow => ({ kind: 'user', user })),
    ];
  }, [state.data]);
  // total_count counts live accounts only: deleted accounts are listed apart and not counted.
  const connectionCount = state.data.filter((user) => !user.is_deleted && user.is_service_account).length;
  const peopleCount = Math.max(0, state.totalCount - connectionCount);

  const renderItem = useCallback(
    ({ item }: { item: ListRow }) =>
      item.kind === 'connectionsHeader' ? (
        <SectionHeader title={tr('users.list.connections')} />
      ) : item.kind === 'deletedHeader' ? (
        <SectionHeader title={tr('users.list.deletedAccounts')} />
      ) : (
        <FioriUserCard user={item.user} isSelf={!!userProfile?.id && item.user.id === userProfile.id} onPress={() => handleEditUser(item.user.id)} />
      ),
    [handleEditUser, userProfile?.id]
  );

  const keyExtractor = useCallback(
    (item: ListRow) => (item.kind === 'user' ? item.user.id : item.kind === 'deletedHeader' ? 'deleted-header' : 'connections-header'),
    []
  );

  const renderEmpty = useCallback(() => {
    if (state.loading) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="progressbar" accessibilityLabel={tr('users.list.loading')}>
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.emptyText}>{tr('users.list.loadingText')}</Text>
        </View>
      );
    }

    if (state.error) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.emptyTitle} accessibilityRole="header">
            {tr('users.list.errorTitle')}
          </Text>
          <Text style={styles.emptyText}>{tr('common.checkConnection')}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={handleRefresh}
            accessibilityRole="button"
          >
            <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.secondaryButtonText}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    // A search with no match is not an empty list: say so and offer to clear it.
    if (state.filters.search_query) {
      return (
        <View style={styles.emptyContainer}>
          <Icon name="magnify" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyText}>{tr('users.list.noMatch', { search: state.filters.search_query })}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => handleSearch('')}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>{tr('common.clearSearch')}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Icon name="account-group-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle} accessibilityRole="header">
          {tr('users.list.emptyTitle')}
        </Text>
        <Text style={styles.emptyText}>{tr('users.list.emptyMessage')}</Text>
      </View>
    );
  }, [state.loading, state.error, state.filters.search_query, handleRefresh, handleSearch, styles, t]);

  const renderFooter = useCallback(() => {
    if (state.moreFailed && !state.loadingMore) {
      return (
        <LoadMoreErrorFooter
          message={tr('users.list.loadMoreFailed')}
          retryLabel={tr('users.list.retryMore')}
          onRetry={() => fetchUsers(state.filters, state.data.length)}
          testID="users-load-more-error"
        />
      );
    }
    if (!state.loadingMore) return null;

    return (
      <View style={styles.footerContainer} accessibilityRole="progressbar" accessibilityLabel={tr('users.list.loadingMore')}>
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerText}>{tr('common.loadingMore')}</Text>
      </View>
    );
  }, [state.loadingMore, state.moreFailed, state.filters, state.data.length, fetchUsers, styles, t]);

  const headerOptions = {
    headerShown: true,
    headerStyle: { backgroundColor: t.surface.header },
    headerShadowVisible: false,
    headerTintColor: t.brand.tint,
    headerTitleAlign: 'center' as const,
    headerLeft: () => (
      <HeaderBackButton />
    ),
  };

  // Access denied view
  if (!hasAccess || state.noAccess) {
    return (
      <>
        <Stack.Screen
          options={{
            ...headerOptions,
            headerTitle: () => (
              <View style={styles.titleContainer} accessible accessibilityRole="header">
                <Text style={styles.title}>{tr('users.list.title')}</Text>
              </View>
            ),
          }}
        />
        <View style={[styles.container, styles.emptyContainer]}>
          <Icon name="lock-outline" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyTitle} accessibilityRole="header">
            {tr('users.list.noAccessTitle')}
          </Text>
          <Text style={styles.emptyText}>
            {tr('users.list.noAccessMessage')}
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      {/* Fiori Navigation Bar */}
      <Stack.Screen
        options={{
          ...headerOptions,
          headerTitle: () => (
            <View style={styles.titleContainer} accessible accessibilityRole="header">
              <Text style={styles.title}>{tr('users.list.title')}</Text>
            </View>
          ),
        }}
      />

      <View style={styles.container} testID="users-screen">
        <MasterListHeader
          listKey="users"
          search={state.filters.search_query ?? ''}
          onSearch={handleSearch}
          placeholder={tr('users.list.searchPlaceholder')}
          loading={state.loading}
          countText={peopleCount > 0 ? formatCount(peopleCount, 'user') : undefined}
          refreshError={
            state.refreshFailed
              ? {
                  message: tr('users.list.refreshFailed', { time: formatTime(state.loadedAt) }),
                  onRetry: () => fetchUsers(state.filters, 0),
                }
              : undefined
          }
        />
        <FlatList
          style={styles.flatList}
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            // Android: app/_layout.tsx already pads the screen by the navigation bar.
            Platform.OS === 'ios' && { paddingBottom: space.xl + insets.bottom },
            state.data.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={state.refreshing}
              onRefresh={handleRefresh}
              colors={[t.brand.tint]}
              tintColor={t.brand.tint}
              progressBackgroundColor={t.surface.card}
            />
          }
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

/** Roles are categories, not statuses: staff roles informative, others neutral. */
const ROLE_TONE: Record<UserRole, 'informative' | 'neutral'> = {
  admin: 'informative',
  supervisor: 'informative',
  staff: 'neutral',
  customer: 'neutral',
};

// =============================================================================
// FIORI USER CARD COMPONENT (Object Cell Layout)
// =============================================================================

interface FioriUserCardProps {
  user: UserListItem;
  /** The row is the signed-in person. */
  isSelf?: boolean;
  onPress: () => void;
}

function FioriUserCard({ user, isSelf = false, onPress }: FioriUserCardProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const connection = !!user.is_service_account;
  // A connection has a kind, not a role, and no phone number to show.
  const roleLabel = connection ? tr('users.list.connectionTag') : roleName(user.role);
  const name = user.name || tr('users.unknownUser');
  const deleted = !!user.is_deleted;
  // A deleted account has no phone number to show; the server sends none.
  const mobile = user.mobile && !connection && !deleted ? formatMobile(user.mobile) : null;
  const assigned =
    user.assigned_customers_count > 0 && !deleted
      ? tr('users.list.customersAssigned', { count: user.assigned_customers_count })
      : null;
  // One status tag, by what is true of the account: deleted, a request nobody reviewed, a rejected one, or deactivated.
  const statusTag = deleted
    ? tr('users.tags.deleted')
    : user.enrollment_status === 'pending'
      ? tr('users.tags.accessRequested')
      : user.enrollment_status === 'rejected'
        ? tr('users.tags.requestRejected')
        : user.active
          ? null
          : tr(connection ? 'users.tags.disconnected' : 'common.deactivated');
  const youTag = isSelf ? tr('users.tags.you') : null;
  const rowLabel = [name, youTag, roleLabel, statusTag, mobile, assigned].filter(Boolean).join(', ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rowLabel}
      accessibilityHint={tr('users.list.openHint')}
    >
      {/* Fiori Object Cell: Leading Avatar */}
      <Avatar name={name} id={user.id} style={styles.avatar} />

      {/* Fiori Object Cell: Main Content */}
      <View style={styles.cardContent}>
        <Text style={[styles.headline, (!user.active || deleted) && styles.textInactive]} numberOfLines={2}>
          {name}
        </Text>
        <View style={styles.tagRow}>
          <StatusTag status={connection ? 'neutral' : (ROLE_TONE[user.role] ?? 'neutral')} label={roleLabel} icon={null} />
          {youTag && <StatusTag status="neutral" label={youTag} icon={null} />}
          {statusTag && <StatusTag status={!deleted && user.enrollment_status === 'pending' ? 'critical' : !deleted && user.enrollment_status === 'rejected' ? 'negative' : 'neutral'} label={statusTag} />}
        </View>

        {/* Subheadline - Contact Details */}
        <View style={styles.attributeStack}>
          {mobile && (
            <View style={styles.attributeRow}>
              <Icon name="phone-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.attributeText}>{mobile}</Text>
            </View>
          )}
          {assigned && (
            <View style={styles.attributeRow}>
              <Icon name="account-multiple-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.attributeText}>{assigned}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Fiori Object Cell: Trailing Chevron */}
      <View style={styles.trailingActions}>
        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
      </View>
    </Pressable>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  titleContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  listContent: {
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  // The list fills the space under the search field, so the empty state has a box to centre in.
  flatList: {
    flex: 1,
  },
  listContentEmpty: {
    flexGrow: 1,
  },

  // Object cell
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    minHeight: layout.objectCellMinHeight,
    ...t.shadow[2],
  },
  cardPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  avatar: {
    marginRight: space.md,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center' as const,
    gap: space.xs,
  },
  headline: {
    ...typography.headline,
    color: t.text.primary,
  },
  textInactive: {
    color: t.text.secondary,
  },
  tagRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.s6,
  },
  attributeStack: {
    gap: space.xs,
  },
  attributeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.s6,
  },
  attributeText: {
    ...typography.subhead,
    color: t.text.secondary,
    flexShrink: 1,
  },
  trailingActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginLeft: space.sm,
  },

  // Empty / error / loading states
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.xxl,
    paddingVertical: space.giant,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.sm,
  },
  emptyText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.md,
  },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: touchTarget,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },

  // Footer
  footerContainer: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: space.lg,
    gap: space.sm,
  },
  footerText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
});
