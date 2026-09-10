/**
 * Items Screen - 100% SAP Fiori Compliant
 *
 * Based on SAP Fiori for iOS Design Guidelines
 * Features:
 * - Fiori Navigation Bar with back button
 * - Object Cell layout pattern for item cards
 * - Semantic colors and typography
 * - Platform-specific shadows
 * - 44pt minimum touch targets
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Swipeable } from 'react-native-gesture-handler';
import { useIsFocused } from '@react-navigation/native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { itemService } from '@/services/item-service';
import {
  ItemListItem,
  ItemFilters,
  DEFAULT_ITEM_FILTERS,
} from '@/types/item.types';
import { FIORI } from '@/components/common/overview-tab/FioriTokens';
import { useFioriColors } from '@/theme/fioriColors';

// =============================================================================
// TYPES
// =============================================================================

interface ListState {
  data: ItemListItem[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  filters: ItemFilters;
  offset: number;
  totalCount: number;
  error: string | null;
}

// =============================================================================
// SCREEN COMPONENT
// =============================================================================

export default function ItemsScreen() {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const fiori = useFioriColors();
  const [state, setState] = useState<ListState>({
    data: [],
    loading: true,
    refreshing: false,
    loadingMore: false,
    filters: DEFAULT_ITEM_FILTERS,
    offset: 0,
    totalCount: 0,
    error: null,
  });

  // ===========================================================================
  // FETCH LOGIC
  // ===========================================================================

  const fetchItems = useCallback(
    async (filters: ItemFilters, offset: number = 0) => {
      if (offset === 0) {
        setState((prev) => ({ ...prev, loading: true, error: null }));
      } else {
        setState((prev) => ({ ...prev, loadingMore: true }));
      }

      try {
        const response = await itemService.getItemList(filters, 20, offset);

        if (response.success) {
          setState((prev) => ({
            ...prev,
            data: offset === 0 ? response.data : [...prev.data, ...response.data],
            totalCount: response.pagination?.total_count || 0,
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
            error: response.message || 'Failed to fetch items',
          }));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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

  // Load items on initial mount and when screen is focused
  useEffect(() => {
    if (isFocused) {
      fetchItems(state.filters, 0);
    }
  }, [isFocused]);

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  const handleRefresh = useCallback(() => {
    setState((prev) => ({ ...prev, refreshing: true, offset: 0 }));
    fetchItems(state.filters, 0).finally(() => {
      setState((prev) => ({ ...prev, refreshing: false }));
    });
  }, [state.filters, fetchItems]);

  const handleEndReached = useCallback(() => {
    const hasMore =
      state.totalCount > state.data.length && !state.loadingMore && !state.loading;
    if (hasMore) {
      fetchItems(state.filters, state.offset + 20);
    }
  }, [state, fetchItems]);

  const handleEditItem = useCallback((itemId: string) => {
    router.push({
      pathname: '/item-edit/[id]',
      params: { id: itemId },
    });
  }, []);

  const handleToggleActive = useCallback(
    async (itemId: string, currentActive: boolean) => {
      try {
        const result = await itemService.toggleItemActive(itemId, !currentActive);

        if (result.success) {
          // Update local state to reflect the change
          setState((prev) => ({
            ...prev,
            data: prev.data.map((item) =>
              item.id === itemId
                ? { ...item, active: !currentActive }
                : item
            ),
          }));
        } else {
          // Show error to user
          Alert.alert(
            currentActive ? 'Cannot Deactivate' : 'Cannot Activate',
            result.message || 'Operation failed',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('[Items] Toggle active error:', error);
        Alert.alert('Error', 'An unexpected error occurred', [{ text: 'OK' }]);
      }
    },
    []
  );

  const handleAddItem = useCallback(() => {
    router.push('/item-form');
  }, []);

  const handleDeleteItem = useCallback(
    async (item: ItemListItem) => {
      Alert.alert(
        'Delete Item',
        `Are you sure you want to delete "${item.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                const result = await itemService.deleteItem(item.id);

                if (result.success) {
                  // Remove item from local state
                  setState((prev) => ({
                    ...prev,
                    data: prev.data.filter((i) => i.id !== item.id),
                    totalCount: prev.totalCount - 1,
                  }));
                  Alert.alert('Success', 'Item deleted successfully');
                } else {
                  // Check if blocked due to references
                  if (result.references) {
                    const refs = result.references;
                    let message = 'This item cannot be deleted because it is referenced in:\n\n';
                    if (refs.grn_count > 0) {
                      message += `• ${refs.grn_count} GRN(s)\n`;
                    }
                    if (refs.dispatch_count > 0) {
                      message += `• ${refs.dispatch_count} Dispatch(es)\n`;
                    }
                    if (refs.invoice_count > 0) {
                      message += `• ${refs.invoice_count} Invoice(s)\n`;
                    }
                    message += '\nDeactivate the item instead to hide it from searches.';
                    Alert.alert('Cannot Delete', message);
                  } else {
                    Alert.alert('Error', result.message || 'Failed to delete item');
                  }
                }
              } catch (error) {
                console.error('[Items] Delete error:', error);
                Alert.alert('Error', 'An unexpected error occurred');
              }
            },
          },
        ]
      );
    },
    []
  );

  // ===========================================================================
  // RENDER
  // ===========================================================================

  const renderItem = useCallback(
    ({ item }: { item: ItemListItem }) => (
      <FioriItemCard
        item={item}
        onPress={() => handleEditItem(item.id)}
        onToggleActive={() => handleToggleActive(item.id, item.active)}
        onDelete={() => handleDeleteItem(item)}
      />
    ),
    [handleEditItem, handleToggleActive, handleDeleteItem]
  );

  const keyExtractor = useCallback((item: ItemListItem) => item.id, []);

  const renderEmpty = useCallback(() => {
    if (state.loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={fiori.colors.tint} />
          <Text style={[styles.emptyText, { color: fiori.colors.textSecondary }]}>Loading items...</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Icon name="cube-outline" size={64} color={fiori.colors.textTertiary} />
        </View>
        <Text style={[styles.emptyTitle, { color: fiori.colors.textPrimary }]}>No Items</Text>
        <Text style={[styles.emptyText, { color: fiori.colors.textSecondary }]}>No items found. Create one to get started.</Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: fiori.colors.tint },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleAddItem}
        >
          <Icon name="plus" size={20} color={fiori.colors.iconOnPrimary} />
          <Text style={[styles.primaryButtonText, { color: fiori.colors.iconOnPrimary }]}>Add Item</Text>
        </Pressable>
      </View>
    );
  }, [state.loading, handleAddItem, fiori]);

  const renderFooter = useCallback(() => {
    if (!state.loadingMore) return null;

    return (
      <View style={styles.footerContainer}>
        <ActivityIndicator size="small" color={fiori.colors.tint} />
        <Text style={[styles.footerText, { color: fiori.colors.textSecondary }]}>Loading more...</Text>
      </View>
    );
  }, [state.loadingMore, fiori]);

  // Dynamic header styles
  const dynamicHeaderStyles = useMemo(() => ({
    navBar: {
      backgroundColor: fiori.colors.background,
      borderBottomWidth: 1,
      borderBottomColor: fiori.colors.divider,
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
  }), [fiori]);

  return (
    <>
      {/* Fiori Navigation Bar */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: dynamicHeaderStyles.navBar,
          headerTintColor: fiori.colors.tint,
          headerTitleAlign: 'center',
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={headerStyles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Icon name="chevron-left" size={28} color={fiori.colors.tint} />
              <Text style={[headerStyles.backButtonText, { color: fiori.colors.tint }]}>Back</Text>
            </Pressable>
          ),
          headerTitle: () => (
            <View style={headerStyles.titleContainer}>
              <Text style={[headerStyles.title, { color: fiori.colors.textPrimary }]}>Items</Text>
              {state.totalCount > 0 && (
                <Text style={[headerStyles.subtitle, { color: fiori.colors.textSecondary }]}>{state.totalCount} total</Text>
              )}
            </View>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleAddItem}
              style={headerStyles.addButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Add item"
            >
              <Icon name="plus" size={24} color={fiori.colors.tint} />
            </Pressable>
          ),
        }}
      />

      <View style={[styles.container, { paddingBottom: insets.bottom, backgroundColor: fiori.colors.backgroundGrouped }]}>
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
              colors={[fiori.colors.tint]}
              tintColor={fiori.colors.tint}
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
// FIORI ITEM CARD COMPONENT (Object Cell Layout)
// Based on SAP Fiori for iOS Design Guidelines
// =============================================================================

interface FioriItemCardProps {
  item: ItemListItem;
  onPress: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

function FioriItemCard({
  item,
  onPress,
  onToggleActive,
  onDelete,
}: FioriItemCardProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const fiori = useFioriColors();

  const handleDelete = () => {
    swipeableRef.current?.close();
    onDelete();
  };

  const renderRightActions = () => (
    <View style={styles.swipeActionsContainer}>
      <Pressable
        style={({ pressed }) => [
          styles.swipeAction,
          { backgroundColor: fiori.colors.destructive },
          pressed && styles.swipeActionPressed,
        ]}
        onPress={handleDelete}
      >
        <Icon name="trash-can-outline" size={22} color="#fff" />
        <Text style={styles.swipeActionText}>Delete</Text>
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
    >
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: fiori.colors.cardBackground, borderColor: fiori.colors.divider },
          !item.active && { backgroundColor: fiori.colors.backgroundGrouped, borderColor: fiori.colors.divider },
          pressed && { backgroundColor: fiori.colors.backgroundSecondary },
        ]}
        onPress={onPress}
      >
        {/* Fiori Object Cell: Leading Avatar */}
        <View style={[
          styles.avatar,
          { backgroundColor: fiori.colors.tintLight },
          !item.active && { backgroundColor: fiori.colors.divider },
        ]}>
          <Text style={[
            styles.avatarText,
            { color: fiori.colors.tint },
            !item.active && { color: fiori.colors.textTertiary },
          ]}>
            {(item.name || 'I').charAt(0).toUpperCase()}
          </Text>
        </View>

        {/* Fiori Object Cell: Main Content */}
        <View style={styles.cardContent}>
          {/* Headline - Item Name */}
          <View style={styles.headlineRow}>
            <Text
              style={[
                styles.headline,
                { color: fiori.colors.textPrimary },
                !item.active && { color: fiori.colors.textTertiary },
              ]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {!item.active && (
              <View style={[styles.statusBadge, { backgroundColor: fiori.colors.destructiveLight }]}>
                <Text style={[styles.statusBadgeText, { color: fiori.colors.destructive }]}>Inactive</Text>
              </View>
            )}
          </View>

          {/* Subheadline - Item Details */}
          <View style={styles.attributeStack}>
            {item.packaging && (
              <View style={styles.attributeRow}>
                <Icon name="package-variant" size={14} color={fiori.colors.textTertiary} />
                <Text style={[
                  styles.attributeText,
                  { color: fiori.colors.textSecondary },
                  !item.active && { color: fiori.colors.textTertiary },
                ]}>
                  {item.packaging}
                </Text>
              </View>
            )}
            {item.description && (
              <View style={styles.attributeRow}>
                <Icon name="text-box-outline" size={14} color={fiori.colors.textTertiary} />
                <Text
                  style={[
                    styles.attributeText,
                    { color: fiori.colors.textSecondary },
                    !item.active && { color: fiori.colors.textTertiary },
                  ]}
                  numberOfLines={1}
                >
                  {item.description}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Fiori Object Cell: Trailing Actions */}
        <View style={styles.trailingActions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: fiori.colors.backgroundGrouped },
              pressed && { backgroundColor: fiori.colors.divider },
            ]}
            onPress={onToggleActive}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={item.active ? 'Deactivate item' : 'Activate item'}
          >
            <Icon
              name={item.active ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={item.active ? fiori.colors.textTertiary : fiori.colors.success}
            />
          </Pressable>
          <Icon name="chevron-right" size={20} color={fiori.colors.textTertiary} />
        </View>
      </Pressable>
    </Swipeable>
  );
}

// =============================================================================
// FIORI HEADER STYLES
// Based on SAP Fiori for iOS Design Guidelines - Navigation Bar
// Colors are applied dynamically via useFioriColors hook
// =============================================================================

const headerStyles = StyleSheet.create({
  // Back Button - Fiori spec: 44pt touch target
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI.dimensions.touchTarget,
    paddingRight: FIORI.spacing.sm,
    marginLeft: -FIORI.spacing.sm,
  },
  backButtonText: {
    ...FIORI.typography.body,
    marginLeft: -4,
  },

  // Title container - centered layout (Fiori spec)
  titleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Title - Fiori: 17pt Semibold
  title: {
    ...FIORI.typography.headline,
    letterSpacing: -0.41,
    textAlign: 'center',
  },

  // Subtitle - count
  subtitle: {
    ...FIORI.typography.caption,
    textAlign: 'center',
    marginTop: 2,
  },

  // Add Button
  addButton: {
    minWidth: FIORI.dimensions.touchTarget,
    minHeight: FIORI.dimensions.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// =============================================================================
// FIORI MAIN STYLES
// Based on SAP Fiori for iOS Design Guidelines
// Colors are applied dynamically via useFioriColors hook
// =============================================================================

const styles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
  },
  listContent: {
    paddingTop: FIORI.spacing.md,
    paddingBottom: FIORI.spacing.xl,
  },
  listContentEmpty: {
    flex: 1,
  },
  separator: {
    height: 0, // Cards have built-in margin
  },

  // Fiori Object Cell Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: FIORI.dimensions.cardRadius,
    padding: FIORI.dimensions.cardPadding,
    marginHorizontal: FIORI.spacing.lg,
    marginBottom: FIORI.spacing.md,
    borderWidth: 1,
    minHeight: FIORI.dimensions.touchTarget * 2,
    ...FIORI.shadows.card,
  },

  // Avatar - Fiori Object Cell Leading Element
  avatar: {
    width: FIORI.dimensions.avatarSize,
    height: FIORI.dimensions.avatarSize,
    borderRadius: FIORI.dimensions.avatarSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: FIORI.spacing.md,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
  },

  // Card Content - Fiori Object Cell Main Content
  cardContent: {
    flex: 1,
    marginRight: FIORI.spacing.sm,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.sm,
    marginBottom: FIORI.spacing.xs,
  },
  headline: {
    ...FIORI.typography.headline,
    flex: 1,
  },

  // Status Badge
  statusBadge: {
    paddingHorizontal: FIORI.spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Attribute Stack - Fiori Object Cell Subheadline
  attributeStack: {
    gap: FIORI.spacing.xs,
  },
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.xs,
  },
  attributeText: {
    ...FIORI.typography.caption,
    flex: 1,
  },

  // Trailing Actions - Fiori Object Cell Trailing Element
  trailingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.sm,
  },
  actionButton: {
    width: FIORI.dimensions.touchTarget,
    height: FIORI.dimensions.touchTarget,
    borderRadius: FIORI.dimensions.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty State - Fiori Spec
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: FIORI.spacing.xxl,
    paddingVertical: FIORI.spacing.xxl * 2,
  },
  emptyIconContainer: {
    marginBottom: FIORI.spacing.lg,
  },
  emptyTitle: {
    ...FIORI.typography.headline,
    fontSize: 20,
    marginBottom: FIORI.spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    ...FIORI.typography.body,
    textAlign: 'center',
    marginBottom: FIORI.spacing.xl,
  },

  // Primary Button - Fiori Primary Tint
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: FIORI.dimensions.buttonHeight,
    borderRadius: FIORI.dimensions.buttonRadius,
    paddingHorizontal: FIORI.spacing.xl,
    gap: FIORI.spacing.sm,
  },
  primaryButtonText: {
    ...FIORI.typography.button,
  },

  // Footer
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: FIORI.spacing.lg,
    gap: FIORI.spacing.sm,
  },
  footerText: {
    ...FIORI.typography.caption,
  },

  // Swipe Actions
  swipeActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: FIORI.spacing.lg,
    paddingLeft: FIORI.spacing.sm,
    marginBottom: FIORI.spacing.md,
  },
  swipeAction: {
    width: 72,
    height: '100%',
    minHeight: FIORI.dimensions.touchTarget * 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: FIORI.dimensions.cardRadius,
    gap: 4,
  },
  swipeActionPressed: {
    opacity: 0.85,
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});
