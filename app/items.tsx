/**
 * Items screen: list report (style guide §14.1).
 *
 * Object cells with an avatar, packaging and description, an Inactive status
 * tag, swipe to delete, pull to refresh, infinite scroll, and loading, empty
 * and error states. Colours come from the semantic tokens.
 */

import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useIsFocused } from 'expo-router';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { itemService } from '@/services/item-service';
import {
  ItemListItem,
  ItemFilters,
  DEFAULT_ITEM_FILTERS,
} from '@/types/item.types';
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
} from '@/theme/tokens';

import { showAlert } from '@/utils/alert';
import { Avatar, StatusTag } from '@/components/ui';
import { formatCount } from '@/utils/formatters';
import { t as tr } from '@/i18n';
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
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
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
          showAlert(
            currentActive ? tr('items.list.couldNotDeactivateTitle') : tr('items.list.couldNotActivateTitle'),
            result.message || tr('items.list.tryAgainInAMoment'),
            [{ text: tr('common.ok') }]
          );
        }
      } catch (error) {
        console.error('[Items] Toggle active error:', error);
        showAlert(tr('items.list.couldNotUpdateTitle'), tr('common.checkConnection'), [{ text: tr('common.ok') }]);
      }
    },
    []
  );

  // Deactivating asks first (like customers); activating again happens straight away.
  const handleToggleActiveRequest = useCallback(
    (item: ItemListItem) => {
      if (!item.active) {
        handleToggleActive(item.id, false);
        return;
      }
      showAlert(tr('items.list.deactivateConfirmTitle', { name: item.name }), undefined, [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('items.list.deactivateItem'),
          style: 'destructive',
          onPress: () => handleToggleActive(item.id, true),
        },
      ]);
    },
    [handleToggleActive]
  );

  const handleAddItem = useCallback(() => {
    router.push('/item-form');
  }, []);

  const handleDeleteItem = useCallback(
    async (item: ItemListItem) => {
      showAlert(
        tr('items.delete.confirmTitle', { name: item.name }),
        tr('items.delete.confirmMessage'),
        [
          { text: tr('common.cancel'), style: 'cancel' },
          {
            text: tr('items.delete.deleteItem'),
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
                  showAlert(tr('items.delete.deletedTitle'), tr('items.delete.deletedMessage', { name: item.name }));
                } else {
                  // Check if blocked due to references
                  if (result.references) {
                    const refs = result.references;
                    let message = `${tr('items.delete.usedIn')}\n\n`;
                    if (refs.grn_count > 0) {
                      message += `${tr('items.delete.usedInLine', { count: formatCount(refs.grn_count, 'GRN') })}\n`;
                    }
                    if (refs.dispatch_count > 0) {
                      message += `${tr('items.delete.usedInLine', { count: formatCount(refs.dispatch_count, 'dispatch', 'dispatches') })}\n`;
                    }
                    if (refs.invoice_count > 0) {
                      message += `${tr('items.delete.usedInLine', { count: formatCount(refs.invoice_count, 'invoice') })}\n`;
                    }
                    message += `\n${tr('items.delete.deactivateInstead')}`;
                    showAlert(tr('items.delete.cannotDeleteTitle'), message);
                  } else {
                    showAlert(tr('items.delete.couldNotDeleteTitle'), result.message || tr('items.list.tryAgainInAMoment'));
                  }
                }
              } catch (error) {
                console.error('[Items] Delete error:', error);
                showAlert(tr('items.delete.couldNotDeleteTitle'), tr('common.checkConnection'));
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
        onToggleActive={() => handleToggleActiveRequest(item)}
        onDelete={() => handleDeleteItem(item)}
      />
    ),
    [handleEditItem, handleToggleActiveRequest, handleDeleteItem]
  );

  const keyExtractor = useCallback((item: ItemListItem) => item.id, []);

  const renderEmpty = useCallback(() => {
    if (state.loading) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="progressbar" accessibilityLabel={tr('items.list.loadingLabel')}>
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.emptyText}>{tr('items.list.loading')}</Text>
        </View>
      );
    }

    // A failed load is not an empty catalogue: never offer "Add item" for it.
    if (state.error) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.emptyTitle} accessibilityRole="header">
            {tr('items.list.loadErrorTitle')}
          </Text>
          <Text style={styles.emptyText}>{tr('common.checkConnection')}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => fetchItems(state.filters, 0)}
            accessibilityRole="button"
          >
            <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.secondaryButtonText}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Icon name="cube-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle} accessibilityRole="header">
          {tr('items.list.emptyTitle')}
        </Text>
        <Text style={styles.emptyText}>{tr('items.list.emptyMessage')}</Text>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handleAddItem}
          accessibilityRole="button"
        >
          <Icon name="plus" size={iconSize.md} color={t.brand.onFill} />
          <Text style={styles.primaryButtonText}>{tr('items.list.addItem')}</Text>
        </Pressable>
      </View>
    );
  }, [state.loading, state.error, state.filters, fetchItems, handleAddItem, styles, t]);

  const renderFooter = useCallback(() => {
    if (!state.loadingMore) return null;

    return (
      <View style={styles.footerContainer} accessibilityRole="progressbar" accessibilityLabel={tr('items.list.loadingMoreLabel')}>
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerText}>{tr('common.loadingMore')}</Text>
      </View>
    );
  }, [state.loadingMore, styles, t]);

  return (
    <>
      {/* Fiori Navigation Bar */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: t.surface.header },
          headerShadowVisible: false,
          headerTintColor: t.brand.tint,
          headerTitleAlign: 'center',
          headerLeft: () => (
            <HeaderBackButton />
          ),
          headerTitle: () => (
            <View style={styles.titleContainer} accessible accessibilityRole="header">
              <Text style={styles.headerTitle}>{tr('common.items')}</Text>
              {state.totalCount > 0 && (
                <Text style={styles.headerSubtitle}>{formatCount(state.totalCount, 'item')}</Text>
              )}
            </View>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleAddItem}
              style={styles.addButton}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel={tr('items.list.addItem')}
            >
              <Icon name="plus" size={iconSize.lg} color={t.brand.tint} />
            </Pressable>
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
// FIORI ITEM CARD COMPONENT (Object Cell Layout)
// =============================================================================

interface FioriItemCardProps {
  item: ItemListItem;
  onPress: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

function FioriItemCard({ item, onPress, onToggleActive, onDelete }: FioriItemCardProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const actionLabel = item.active ? tr('items.list.deactivate') : tr('items.list.activate');
  const rowLabel = [item.name, item.active ? null : tr('common.inactive'), item.packaging, item.description]
    .filter(Boolean)
    .join(', ');

  const handleDelete = () => {
    swipeableRef.current?.close();
    onDelete();
  };

  const handleToggle = () => {
    swipeableRef.current?.close();
    onToggleActive();
  };

  const renderRightActions = () => (
    <View style={styles.swipeActionsContainer}>
      <Pressable
        style={({ pressed }) => [
          styles.swipeAction,
          item.active ? styles.swipeDeactivate : styles.swipeActivate,
          pressed && (item.active ? styles.swipeActionPressed : styles.swipeActivatePressed),
        ]}
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={tr(item.active ? 'items.list.deactivateName' : 'items.list.activateName', { name: item.name })}
      >
        <Icon
          name={item.active ? 'archive-arrow-down-outline' : 'archive-arrow-up-outline'}
          size={iconSize.lg}
          color={item.active ? t.destructive.onFill : t.brand.onFill}
        />
        <Text
          style={[styles.swipeActionText, !item.active && styles.swipeActivateText]}
          maxFontSizeMultiplier={1.4}
        >
          {actionLabel}
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.swipeAction, pressed && styles.swipeActionPressed]}
        onPress={handleDelete}
        accessibilityRole="button"
        accessibilityLabel={tr('items.list.deleteName', { name: item.name })}
      >
        <Icon name="trash-can-outline" size={iconSize.lg} color={t.destructive.onFill} />
        <Text style={styles.swipeActionText}>{tr('common.delete')}</Text>
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
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={rowLabel}
        accessibilityHint={item.active ? tr('items.list.rowHintDeactivate') : tr('items.list.rowHintActivate')}
        accessibilityActions={[
          { name: 'toggleActive', label: actionLabel },
          { name: 'delete', label: tr('common.delete') },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'toggleActive') onToggleActive();
          if (event.nativeEvent.actionName === 'delete') onDelete();
        }}
      >
        {/* Fiori Object Cell: Leading Avatar */}
        <Avatar name={item.name} id={item.id} style={styles.avatar} />

        {/* Fiori Object Cell: Main Content */}
        <View style={styles.cardContent}>
          <Text style={[styles.headline, !item.active && styles.textInactive]} numberOfLines={2}>
            {item.name}
          </Text>
          {!item.active && <StatusTag status="neutral" label={tr('common.inactive')} />}

          {/* Subheadline - Item Details */}
          <View style={styles.attributeStack}>
            {item.packaging && (
              <View style={styles.attributeRow}>
                <Icon name="package-variant" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.attributeText}>{item.packaging}</Text>
              </View>
            )}
            {item.description && (
              <View style={styles.attributeRow}>
                <Icon name="text-box-outline" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.attributeText} numberOfLines={1}>
                  {item.description}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Fiori Object Cell: Chevron */}
        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
      </Pressable>
    </Swipeable>
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
  listContent: {
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  listContentEmpty: {
    flex: 1,
  },

  // Header
  titleContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  headerSubtitle: {
    ...typography.caption1,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  addButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // Object cell
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: radius.card,
    padding: space.lg,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    minHeight: layout.objectCellMinHeight,
    backgroundColor: t.surface.card,
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
    marginRight: space.sm,
    gap: space.xs,
  },
  headline: {
    ...typography.headline,
    color: t.text.primary,
  },
  textInactive: {
    color: t.text.secondary,
  },
  attributeStack: {
    gap: space.xs,
  },
  attributeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  attributeText: {
    ...typography.subhead,
    color: t.text.secondary,
    flex: 1,
  },

  // Empty / error / loading states
  emptyContainer: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: touchTarget,
    borderRadius: radius.button,
    paddingHorizontal: space.xl,
    gap: space.sm,
    backgroundColor: t.brand.fill,
  },
  primaryButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  primaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
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
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.lg,
    gap: space.sm,
  },
  footerText: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  // Swipe Actions
  swipeActionsContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingRight: layout.marginCompact,
    paddingLeft: space.sm,
    marginBottom: space.sm,
    gap: space.sm,
  },
  swipeAction: {
    minWidth: 72,
    height: '100%' as const,
    minHeight: layout.objectCellMinHeight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.sm,
    borderRadius: radius.card,
    gap: space.xs,
    backgroundColor: t.destructive.fill,
  },
  swipeDeactivate: {
    backgroundColor: t.destructive.fill,
  },
  swipeActivate: {
    backgroundColor: t.brand.fill,
  },
  swipeActivatePressed: {
    backgroundColor: t.brand.fillPressed,
  },
  swipeActivateText: {
    color: t.brand.onFill,
  },
  swipeActionPressed: {
    backgroundColor: t.destructive.fillPressed,
  },
  swipeActionText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.destructive.onFill,
  },
});
