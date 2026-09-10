/**
 * Users Screen - Admin User Management (100% SAP Fiori Compliant)
 *
 * Based on SAP Fiori for iOS Design Guidelines
 * Features:
 * - Fiori Navigation Bar with back button
 * - Object Cell layout pattern for user cards
 * - Role badges with semantic colors
 * - Active/Inactive status toggle
 * - 44pt minimum touch targets
 *
 * Access: Admin and Supervisor roles only
 */

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useIsFocused } from '@react-navigation/native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { adminUserService } from '@/services/admin-user-service';
import { UserListItem, UserFilters, UserRole } from '@/types/user.types';
import { FIORI } from '@/components/common/overview-tab/FioriTokens';
import { useAppSelector } from '@/store/hooks';
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
  const colors = useListColors();

  // Dynamic styles for dark mode
  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.gray50,
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
        subtitle: {
          ...FIORI.typography.caption,
          color: colors.textSecondary,
          textAlign: 'center',
          marginTop: 2,
        },
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.cellBackground,
          borderRadius: FIORI.dimensions.cardRadius,
          padding: FIORI.dimensions.cardPadding,
          marginHorizontal: FIORI.spacing.lg,
          marginBottom: FIORI.spacing.md,
          borderWidth: 1,
          borderColor: colors.cellDivider,
          minHeight: FIORI.dimensions.touchTarget * 2,
          ...FIORI.shadows.card,
        },
        cardInactive: {
          backgroundColor: colors.gray100,
          borderColor: colors.cellDivider,
        },
        cardPressed: {
          backgroundColor: colors.cellBackgroundPressed,
        },
        avatar: {
          width: FIORI.dimensions.avatarSize,
          height: FIORI.dimensions.avatarSize,
          borderRadius: FIORI.dimensions.avatarSize / 2,
          backgroundColor: colors.primaryLight,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: FIORI.spacing.md,
        },
        avatarInactive: {
          backgroundColor: colors.gray200,
        },
        avatarText: {
          ...FIORI.typography.headline,
          color: colors.primary,
        },
        avatarTextInactive: {
          color: colors.textTertiary,
        },
        headline: {
          ...FIORI.typography.headline,
          color: colors.textPrimary,
          flexShrink: 1,
        },
        textInactive: {
          color: colors.textTertiary,
        },
        attributeText: {
          ...FIORI.typography.caption,
          color: colors.textSecondary,
        },
        emptyContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: FIORI.spacing.xxl,
        },
        emptyTitle: {
          ...FIORI.typography.headline,
          color: colors.textPrimary,
          marginBottom: FIORI.spacing.sm,
          textAlign: 'center',
        },
        emptyText: {
          ...FIORI.typography.body,
          color: colors.textSecondary,
          textAlign: 'center',
          marginBottom: FIORI.spacing.lg,
        },
        primaryButton: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primary,
          paddingHorizontal: FIORI.spacing.lg,
          height: FIORI.dimensions.buttonHeight,
          borderRadius: FIORI.dimensions.buttonRadius,
          gap: FIORI.spacing.sm,
          marginTop: FIORI.spacing.md,
        },
        primaryButtonText: {
          ...FIORI.typography.button,
          color: colors.cellBackground,
        },
        footerText: {
          ...FIORI.typography.caption,
          color: colors.textSecondary,
        },
      }),
    [colors]
  );

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
      <FioriUserCard user={item} onPress={() => handleEditUser(item.id)} colors={colors} dynamicStyles={dynamicStyles} />
    ),
    [handleEditUser, colors, dynamicStyles]
  );

  const keyExtractor = useCallback((item: UserListItem) => item.id, []);

  const renderEmpty = useCallback(() => {
    if (state.loading) {
      return (
        <View style={dynamicStyles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={dynamicStyles.emptyText}>Loading users...</Text>
        </View>
      );
    }

    if (state.error) {
      return (
        <View style={dynamicStyles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Icon
              name="alert-circle-outline"
              size={64}
              color={colors.statusNegative}
            />
          </View>
          <Text style={dynamicStyles.emptyTitle}>Error Loading Users</Text>
          <Text style={dynamicStyles.emptyText}>{state.error}</Text>
          <Pressable
            style={({ pressed }) => [
              dynamicStyles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            onPress={handleRefresh}
          >
            <Icon name="refresh" size={20} color={colors.cellBackground} />
            <Text style={dynamicStyles.primaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={dynamicStyles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Icon
            name="account-group-outline"
            size={64}
            color={colors.textTertiary}
          />
        </View>
        <Text style={dynamicStyles.emptyTitle}>No Users</Text>
        <Text style={dynamicStyles.emptyText}>No users found.</Text>
      </View>
    );
  }, [state.loading, state.error, handleRefresh, colors, dynamicStyles]);

  const renderFooter = useCallback(() => {
    if (!state.loadingMore) return null;

    return (
      <View style={styles.footerContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={dynamicStyles.footerText}>Loading more...</Text>
      </View>
    );
  }, [state.loadingMore, colors, dynamicStyles]);

  // Access denied view
  if (!hasAccess) {
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
                style={headerStyles.backButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="chevron-left" size={28} color={colors.primary} />
                <Text style={dynamicStyles.backButtonText}>Back</Text>
              </Pressable>
            ),
            headerTitle: () => (
              <View style={headerStyles.titleContainer}>
                <Text style={dynamicStyles.title}>Users</Text>
              </View>
            ),
          }}
        />
        <View style={[dynamicStyles.container, dynamicStyles.emptyContainer]}>
          <Icon
            name="lock-outline"
            size={64}
            color={colors.textTertiary}
          />
          <Text style={dynamicStyles.emptyTitle}>Access Denied</Text>
          <Text style={dynamicStyles.emptyText}>
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
          headerShown: true,
          headerStyle: dynamicStyles.navBar,
          headerTintColor: colors.primary,
          headerTitleAlign: 'center',
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={headerStyles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Icon name="chevron-left" size={28} color={colors.primary} />
              <Text style={dynamicStyles.backButtonText}>Back</Text>
            </Pressable>
          ),
          headerTitle: () => (
            <View style={headerStyles.titleContainer}>
              <Text style={dynamicStyles.title}>Users</Text>
              {state.totalCount > 0 && (
                <Text style={dynamicStyles.subtitle}>
                  {state.totalCount} total
                </Text>
              )}
            </View>
          ),
        }}
      />

      <View style={[dynamicStyles.container, { paddingBottom: insets.bottom }]}>
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
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </View>
    </>
  );
}

// =============================================================================
// FIORI USER CARD COMPONENT (Object Cell Layout)
// Based on SAP Fiori for iOS Design Guidelines
// =============================================================================

interface FioriUserCardProps {
  user: UserListItem;
  onPress: () => void;
  colors: ReturnType<typeof useListColors>;
  dynamicStyles: any;
}

function FioriUserCard({ user, onPress, colors, dynamicStyles }: FioriUserCardProps) {
  const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.customer;

  return (
    <Pressable
      style={({ pressed }) => [
        dynamicStyles.card,
        !user.active && dynamicStyles.cardInactive,
        pressed && dynamicStyles.cardPressed,
      ]}
      onPress={onPress}
    >
      {/* Fiori Object Cell: Leading Avatar */}
      <View style={[dynamicStyles.avatar, !user.active && dynamicStyles.avatarInactive]}>
        <Text
          style={[dynamicStyles.avatarText, !user.active && dynamicStyles.avatarTextInactive]}
        >
          {(user.name || 'U').charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Fiori Object Cell: Main Content */}
      <View style={styles.cardContent}>
        {/* Headline - User Name */}
        <View style={styles.headlineRow}>
          <Text
            style={[dynamicStyles.headline, !user.active && dynamicStyles.textInactive]}
            numberOfLines={1}
          >
            {user.name || 'Unknown'}
          </Text>
          {/* Role Badge */}
          <View style={[styles.roleBadge, { backgroundColor: roleColor.bg }]}>
            <Text style={[styles.roleBadgeText, { color: roleColor.text }]}>
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </Text>
          </View>
          {!user.active && (
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>Inactive</Text>
            </View>
          )}
        </View>

        {/* Subheadline - Contact Details */}
        <View style={styles.attributeStack}>
          {user.mobile && (
            <View style={styles.attributeRow}>
              <Icon name="phone" size={14} color={colors.textTertiary} />
              <Text
                style={[
                  dynamicStyles.attributeText,
                  !user.active && dynamicStyles.textInactive,
                ]}
              >
                +91 {user.mobile}
              </Text>
            </View>
          )}
          {user.assigned_customers_count > 0 && (
            <View style={styles.attributeRow}>
              <Icon
                name="account-multiple"
                size={14}
                color={colors.textTertiary}
              />
              <Text
                style={[
                  dynamicStyles.attributeText,
                  !user.active && dynamicStyles.textInactive,
                ]}
              >
                {user.assigned_customers_count} customer
                {user.assigned_customers_count > 1 ? 's' : ''} assigned
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Fiori Object Cell: Trailing Chevron */}
      <View style={styles.trailingActions}>
        <Icon name="chevron-right" size={20} color={colors.textTertiary} />
      </View>
    </Pressable>
  );
}

// =============================================================================
// FIORI HEADER STYLES (Layout only - colors in dynamicStyles)
// Based on SAP Fiori for iOS Design Guidelines - Navigation Bar
// =============================================================================

const headerStyles = StyleSheet.create({
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
});

// =============================================================================
// FIORI MAIN STYLES (Layout only - colors in dynamicStyles)
// Based on SAP Fiori for iOS Design Guidelines
// =============================================================================

const styles = StyleSheet.create({
  listContent: {
    paddingTop: FIORI.spacing.md,
    paddingBottom: FIORI.spacing.xl,
  },
  listContentEmpty: {
    flex: 1,
  },
  separator: {
    height: 0,
  },

  // Card Content
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },

  // Headline Row
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },

  // Role Badge
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  // Status Badge (Inactive)
  statusBadge: {
    backgroundColor: FIORI.colors.negativeLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: FIORI.colors.negative,
  },

  // Attribute Stack
  attributeStack: {
    gap: 4,
  },
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Trailing Actions
  trailingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: FIORI.spacing.sm,
  },

  // Empty State
  emptyIconContainer: {
    marginBottom: FIORI.spacing.lg,
  },
  primaryButtonPressed: {
    opacity: 0.8,
  },

  // Footer
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: FIORI.spacing.lg,
    gap: FIORI.spacing.sm,
  },
});
