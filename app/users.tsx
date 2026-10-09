/**
 * Users screen: admin user management as a list report (style guide §14.1).
 *
 * Object cells with an avatar, role and Inactive tags and contact details,
 * pull to refresh, infinite scroll, and loading, empty, error and no-access
 * states. Colours come from the semantic tokens.
 *
 * Access: Admin and Supervisor roles only
 */

import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { adminUserService } from '@/services/admin-user-service';
import { UserListItem, UserFilters, UserRole } from '@/types/user.types';
import { useAppSelector } from '@/store/hooks';
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
import { Avatar } from '@/components/ui/Avatar';
import { StatusTag } from '@/components/ui/StatusTag';
import { formatCount, formatMobile } from '@/utils/formatters';

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
  totalCount: number;
  error: string | null;
}

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
    error: null,
  });

  // Check access
  const hasAccess =
    userProfile?.role === 'admin' || userProfile?.role === 'supervisor';

  // ===========================================================================
  // FETCH LOGIC
  // ===========================================================================

  const fetchUsers = useCallback(
    async (filters: UserFilters, offset: number = 0) => {
      if (offset === 0) {
        setState((prev) => ({ ...prev, loading: true, error: null }));
      } else {
        setState((prev) => ({ ...prev, loadingMore: true }));
      }

      try {
        const response = await adminUserService.getUsersList(filters, 20, offset);

        if (response.success && response.data) {
          setState((prev) => ({
            ...prev,
            data:
              offset === 0
                ? response.data!.users
                : [...prev.data, ...response.data!.users],
            totalCount: response.data!.pagination.total_count,
            offset,
            loading: false,
            loadingMore: false,
            error: null,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            loading: false,
            loadingMore: false,
            error: response.error || 'Failed to fetch users',
          }));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: errorMessage,
        }));
      }
    },
    []
  );

  // ===========================================================================
  // EFFECTS
  // ===========================================================================

  useEffect(() => {
    if (isFocused && hasAccess) {
      fetchUsers(state.filters, 0);
    }
  }, [isFocused, hasAccess]);

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  const handleRefresh = useCallback(() => {
    setState((prev) => ({ ...prev, refreshing: true, offset: 0 }));
    fetchUsers(state.filters, 0).finally(() => {
      setState((prev) => ({ ...prev, refreshing: false }));
    });
  }, [state.filters, fetchUsers]);

  const handleEndReached = useCallback(() => {
    const hasMore =
      state.totalCount > state.data.length &&
      !state.loadingMore &&
      !state.loading;
    if (hasMore) {
      fetchUsers(state.filters, state.offset + 20);
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

  const renderItem = useCallback(
    ({ item }: { item: UserListItem }) => (
      <FioriUserCard user={item} onPress={() => handleEditUser(item.id)} />
    ),
    [handleEditUser]
  );

  const keyExtractor = useCallback((item: UserListItem) => item.id, []);

  const renderEmpty = useCallback(() => {
    if (state.loading) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="progressbar" accessibilityLabel="Loading users">
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.emptyText}>Loading users…</Text>
        </View>
      );
    }

    if (state.error) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.emptyTitle} accessibilityRole="header">
            Couldn't load users
          </Text>
          <Text style={styles.emptyText}>Check your connection and try again.</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={handleRefresh}
            accessibilityRole="button"
          >
            <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Icon name="account-group-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle} accessibilityRole="header">
          No users yet
        </Text>
        <Text style={styles.emptyText}>People who join this facility appear here.</Text>
      </View>
    );
  }, [state.loading, state.error, handleRefresh, styles, t]);

  const renderFooter = useCallback(() => {
    if (!state.loadingMore) return null;

    return (
      <View style={styles.footerContainer} accessibilityRole="progressbar" accessibilityLabel="Loading more users">
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerText}>Loading more…</Text>
      </View>
    );
  }, [state.loadingMore, styles, t]);

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
  };

  // Access denied view
  if (!hasAccess) {
    return (
      <>
        <Stack.Screen
          options={{
            ...headerOptions,
            headerTitle: () => (
              <View style={styles.titleContainer} accessible accessibilityRole="header">
                <Text style={styles.title}>Users</Text>
              </View>
            ),
          }}
        />
        <View style={[styles.container, styles.emptyContainer]}>
          <Icon name="lock-outline" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyTitle} accessibilityRole="header">
            You can't manage users
          </Text>
          <Text style={styles.emptyText}>
            Only administrators and supervisors can manage users.
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
              <Text style={styles.title}>Users</Text>
              {state.totalCount > 0 && (
                <Text style={styles.subtitle}>{formatCount(state.totalCount, 'user')}</Text>
              )}
            </View>
          ),
        }}
      />

      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <FlatList
          data={state.data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
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
  onPress: () => void;
}

function FioriUserCard({ user, onPress }: FioriUserCardProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  const name = user.name || 'Unknown user';
  const mobile = user.mobile ? formatMobile(user.mobile) : null;
  const assigned =
    user.assigned_customers_count > 0
      ? `${formatCount(user.assigned_customers_count, 'customer')} assigned`
      : null;
  const rowLabel = [name, roleLabel, user.active ? null : 'Inactive', mobile, assigned]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rowLabel}
      accessibilityHint="Opens the user for editing"
    >
      {/* Fiori Object Cell: Leading Avatar */}
      <Avatar name={name} id={user.id} style={styles.avatar} />

      {/* Fiori Object Cell: Main Content */}
      <View style={styles.cardContent}>
        <Text style={[styles.headline, !user.active && styles.textInactive]} numberOfLines={2}>
          {name}
        </Text>
        <View style={styles.tagRow}>
          <StatusTag status={ROLE_TONE[user.role] ?? 'neutral'} label={roleLabel} icon={null} />
          {!user.active && <StatusTag status="neutral" label="Inactive" />}
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
  titleContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  subtitle: {
    ...typography.caption1,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  listContent: {
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  listContentEmpty: {
    flex: 1,
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
