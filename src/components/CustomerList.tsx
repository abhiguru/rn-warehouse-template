/**
 * CustomerList Component
 *
 * Displays a list of customers with search, filter, and action capabilities.
 * Used in the customer management screen for supervisors.
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import theme from '@/theme';
import { CustomerListItem } from '@/types/customer.types';

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
  const handlePress = useCallback(() => {
    // Navigate to edit on card press
    onEdit();
  }, [onEdit]);

  return (
    <TouchableOpacity
      style={[styles.card, !customer.active && styles.cardInactive]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* Customer Avatar */}
      <View style={[styles.avatar, !customer.active && styles.avatarInactive]}>
        <Text style={[styles.avatarText, !customer.active && styles.avatarTextInactive]}>
          {(customer.name || 'C').charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Customer Info */}
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={[styles.customerName, !customer.active && styles.textInactive]} numberOfLines={1}>
            {customer.name}
          </Text>
          {!customer.active && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          )}
        </View>

        <View style={styles.cardDetails}>
          {customer.mobile && (
            <View style={styles.detailRow}>
              <Icon name="phone" size={14} color={theme.colors.gray[400]} />
              <Text style={[styles.detailText, !customer.active && styles.textInactive]}>
                +91 {customer.mobile}
              </Text>
            </View>
          )}
          {customer.city && (
            <View style={styles.detailRow}>
              <Icon name="map-marker" size={14} color={theme.colors.gray[400]} />
              <Text style={[styles.detailText, !customer.active && styles.textInactive]}>
                {customer.city}
              </Text>
            </View>
          )}
          {customer.email && (
            <View style={styles.detailRow}>
              <Icon name="email-outline" size={14} color={theme.colors.gray[400]} />
              <Text style={[styles.detailText, !customer.active && styles.textInactive]} numberOfLines={1}>
                {customer.email}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onEdit}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="pencil" size={20} color={theme.colors.primary[500]} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onToggleActive}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon
            name={customer.active ? 'eye-off' : 'eye'}
            size={20}
            color={customer.active ? theme.colors.gray[400] : theme.colors.semantic.success}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
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
  emptyMessage = 'No customers found',
}: CustomerListProps) {
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
          <ActivityIndicator size="large" color={theme.colors.primary[500]} />
          <Text style={styles.emptyText}>Loading customers...</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Icon name="account-group-outline" size={64} color={theme.colors.gray[300]} />
        <Text style={styles.emptyTitle}>No Customers</Text>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={() => router.push('/customer-form/step1')}
          activeOpacity={0.8}
        >
          <Icon name="plus" size={20} color="#FFFFFF" />
          <Text style={styles.emptyButtonText}>Add Customer</Text>
        </TouchableOpacity>
      </View>
    );
  }, [loading, emptyMessage]);

  const renderFooter = useCallback(() => {
    if (!hasMore || !onLoadMore) return null;

    return (
      <View style={styles.footerContainer}>
        <ActivityIndicator size="small" color={theme.colors.primary[500]} />
        <Text style={styles.footerText}>Loading more...</Text>
      </View>
    );
  }, [hasMore, onLoadMore]);

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
      contentContainerStyle={[
        styles.listContent,
        customers.length === 0 && styles.listContentEmpty,
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[theme.colors.primary[500]]}
          tintColor={theme.colors.primary[500]}
        />
      }
      ListEmptyComponent={renderEmpty}
      ListFooterComponent={renderFooter}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.3}
      showsVerticalScrollIndicator={false}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listContentEmpty: {
    flex: 1,
  },
  separator: {
    height: 12,
  },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.gray[200],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  cardInactive: {
    backgroundColor: theme.colors.gray[50],
    borderColor: theme.colors.gray[300],
  },

  // Avatar
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarInactive: {
    backgroundColor: theme.colors.gray[200],
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.primary[600],
  },
  avatarTextInactive: {
    color: theme.colors.gray[500],
  },

  // Card Content
  cardContent: {
    flex: 1,
    marginRight: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.gray[900],
    flex: 1,
  },
  textInactive: {
    color: theme.colors.gray[500],
  },
  inactiveBadge: {
    backgroundColor: theme.colors.gray[200],
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  inactiveBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: theme.colors.gray[600],
  },
  cardDetails: {
    gap: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    color: theme.colors.gray[600],
    flex: 1,
  },

  // Actions
  cardActions: {
    flexDirection: 'column',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: theme.colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.gray[700],
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: theme.colors.gray[500],
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary[500],
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Footer
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  footerText: {
    fontSize: 14,
    color: theme.colors.gray[500],
  },
});

export default CustomerList;
