/**
 * CustomerList Component
 *
 * Displays a list of customers with search, filter, and action capabilities.
 * Used in the customer management screen for supervisors.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { CustomerListItem } from '@/types/customer.types';
import { Button } from '@/components/ui/Button';
import { StatusTag } from '@/components/ui';
import { formatMobile } from '@/utils/formatters';
import { avatarColors, avatarInitials } from '@/utils/avatar';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

// =============================================================================
// TYPES
// =============================================================================

interface CustomerListProps {
  customers: CustomerListItem[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onEditCustomer: (customerId: string) => void;
  onInactivateCustomer: (customerId: string, isActive: boolean) => void;
  emptyMessage?: string;
}

// =============================================================================
// CUSTOMER CARD COMPONENT
// =============================================================================

interface CustomerCardProps {
  customer: CustomerListItem;
  onEdit: () => void;
  onToggleActive: () => void;
}

function CustomerCard({ customer, onEdit, onToggleActive }: CustomerCardProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const name = customer.name || 'Customer';
  const avatarBackground = customer.active
    ? avatarColors(customer.id || name, t).background
    : t.status.neutral.background;
  const rowLabel = [
    name,
    customer.active ? null : 'Inactive',
    customer.mobile ? formatMobile(customer.mobile) : null,
    customer.city,
  ].filter(Boolean).join(', ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={rowLabel}
      accessibilityHint="Opens the customer to edit"
    >
      {/* Customer Avatar */}
      <View style={[styles.avatar, { backgroundColor: avatarBackground }]}>
        <Text
          style={[styles.avatarText, !customer.active && styles.avatarTextInactive]}
          maxFontSizeMultiplier={1.6}
        >
          {avatarInitials(name)}
        </Text>
      </View>

      {/* Customer Info */}
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.customerName} numberOfLines={2}>
            {name}
          </Text>
          {!customer.active && (
            <StatusTag status="neutral" label="Inactive" />
          )}
        </View>

        <View style={styles.cardDetails}>
          {customer.mobile && (
            <View style={styles.detailRow}>
              <Icon name="phone-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={[styles.detailText, styles.numeric]}>
                {formatMobile(customer.mobile)}
              </Text>
            </View>
          )}
          {customer.city && (
            <View style={styles.detailRow}>
              <Icon name="map-marker-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.detailText}>
                {customer.city}
              </Text>
            </View>
          )}
          {customer.email && (
            <View style={styles.detailRow}>
              <Icon name="email-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.detailText} numberOfLines={1}>
                {customer.email}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.cardActions}>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${name}`}
        >
          <Icon name="pencil-outline" size={iconSize.md} color={t.brand.tint} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={onToggleActive}
          accessibilityRole="button"
          accessibilityLabel={customer.active ? `Deactivate ${name}` : `Activate ${name}`}
        >
          <Icon
            name={customer.active ? 'eye-off-outline' : 'eye-outline'}
            size={iconSize.md}
            color={customer.active ? t.icon.primary : t.brand.tint}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function CustomerList({
  customers,
  loading,
  refreshing,
  onRefresh,
  onLoadMore,
  hasMore = false,
  onEditCustomer,
  onInactivateCustomer,
  emptyMessage = 'Customers you add appear here.',
}: CustomerListProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  // ===========================================================================
  // RENDER CALLBACKS
  // ===========================================================================

  const renderItem = useCallback(
    ({ item }: { item: CustomerListItem }) => (
      <CustomerCard
        customer={item}
        onEdit={() => onEditCustomer(item.id)}
        onToggleActive={() => onInactivateCustomer(item.id, item.active)}
      />
    ),
    [onEditCustomer, onInactivateCustomer]
  );

  const keyExtractor = useCallback((item: CustomerListItem) => item.id, []);

  const renderEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={t.brand.tint} accessibilityLabel="Loading customers" />
          <Text style={styles.emptyText}>Loading customers…</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Icon name="account-group-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle} accessibilityRole="header">No customers yet</Text>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
        <Button
          type="primary"
          size="standalone"
          leftIcon="plus"
          onPress={() => router.push('/customer-form/step1')}
        >
          Add customer
        </Button>
      </View>
    );
  }, [loading, emptyMessage, styles, t]);

  const renderFooter = useCallback(() => {
    if (!hasMore || !onLoadMore) return null;

    return (
      <View style={styles.footerContainer}>
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerText}>Loading more customers…</Text>
      </View>
    );
  }, [hasMore, onLoadMore, styles, t]);

  const handleEndReached = useCallback(() => {
    if (hasMore && onLoadMore && !loading) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore, loading]);

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <FlatList
      data={customers}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      style={styles.list}
      contentContainerStyle={[
        styles.listContent,
        customers.length === 0 && styles.listContentEmpty,
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
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
      ItemSeparatorComponent={Separator}
    />
  );
}

const Separator = () => <View style={staticStyles.separator} />;

// =============================================================================
// STYLES
// =============================================================================

const staticStyles = StyleSheet.create({
  // Between cards in a list (style guide §5.1)
  separator: {
    height: space.sm,
  },
});

const makeStyles = (t: ThemeTokens) => ({
  list: {
    backgroundColor: t.background.base,
  },
  listContent: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
  },
  listContentEmpty: {
    flex: 1,
  },

  // Card (object cell)
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.md,
    ...t.shadow[2],
  },
  cardPressed: {
    backgroundColor: t.surface.cardPressed,
  },

  // Avatar
  avatar: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: space.md,
  },
  // Initials: ink on the light avatar palette, white on the dark one (§3.2)
  avatarText: {
    ...typography.headline,
    color: t.mode === 'dark' ? t.overlay.onImage : t.text.primary,
  },
  avatarTextInactive: {
    color: t.status.neutral.text,
  },

  // Card Content
  cardContent: {
    flex: 1,
    marginRight: space.sm,
  },
  cardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginBottom: space.xs,
  },
  customerName: {
    ...typography.headline,
    color: t.text.primary,
    flex: 1,
  },
  cardDetails: {
    gap: space.xxs,
  },
  detailRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  detailText: {
    ...typography.subhead,
    color: t.text.secondary,
    flex: 1,
  },
  numeric: {
    fontVariant: ['tabular-nums' as const],
  },

  // Actions
  cardActions: {
    flexDirection: 'column' as const,
    gap: space.xs,
  },
  actionButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  actionButtonPressed: {
    backgroundColor: t.brand.subtle,
  },

  // Empty State (style guide §13.6)
  emptyContainer: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: space.xxxl,
    paddingVertical: space.giant,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  emptyText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.xxl,
  },

  // Footer
  footerContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.lg,
    gap: space.sm,
  },
  footerText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
});

export default CustomerList;
