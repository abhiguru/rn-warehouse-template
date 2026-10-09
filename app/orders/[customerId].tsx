import React, { useState, useEffect, useCallback } from 'react';
import { View, ActivityIndicator, Text, Pressable, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useAppSelector } from '@/store/hooks';
import { router } from 'expo-router';
import OrderManagement from '@/components/OrderManagement';
import ChangeLogBottomSheet from '@/components/ChangeLogBottomSheet';
import { ChangeLogService } from '@/services/change-log-service';
import type { ChangeLogEntry, ChangeLogAnalytics, CustomerSummary } from '@/types/order.types';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function CustomerOrderScreen() {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const { user, session, userProfile } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const [customerName, setCustomerName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showItemCatalog, setShowItemCatalog] = useState(false);

  // Changelog state
  const [changelogVisible, setChangelogVisible] = useState(false);
  const [changelogEntries, setChangelogEntries] = useState<ChangeLogEntry[]>([]);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [changelogAnalytics, setChangelogAnalytics] = useState<ChangeLogAnalytics | undefined>(undefined);
  const [changelogHasMore, setChangelogHasMore] = useState(false);
  const [changelogOffset, setChangelogOffset] = useState(0);
  const [changelogError, setChangelogError] = useState<string | undefined>(undefined);

  const handleOpenItemCatalog = useCallback(() => {
    setShowItemCatalog(true);
  }, []);

  const handleCloseItemCatalog = useCallback(() => {
    setShowItemCatalog(false);
  }, []);

  // Fetch changelog entries
  const fetchChangelog = useCallback(async (offset = 0) => {
    if (!customerId) return;

    setChangelogLoading(true);
    setChangelogError(undefined);

    try {
      const result = await ChangeLogService.getCustomerChangeLog(customerId, 20, offset);

      if (result.success && result.data) {
        setChangelogEntries(prev =>
          offset === 0 ? result.data.changes : [...prev, ...result.data.changes]
        );
        setChangelogAnalytics(result.data.analytics);
        setChangelogHasMore(result.data.pagination.has_more);
        setChangelogOffset(offset);
      } else {
        setChangelogError("Couldn't load the order history. Check your connection and try again.");
      }
    } catch (error) {
      console.error('[CustomerOrderScreen] Error fetching changelog:', error);
      setChangelogError("Couldn't load the order history. Check your connection and try again.");
    } finally {
      setChangelogLoading(false);
    }
  }, [customerId]);

  // Handle opening changelog
  const handleOpenChangelog = useCallback(() => {
    fetchChangelog(0);
    setChangelogVisible(true);
  }, [fetchChangelog]);

  // Handle loading more changelog entries
  const handleLoadMoreChangelog = useCallback(() => {
    if (!changelogLoading && changelogHasMore) {
      fetchChangelog(changelogOffset + 20);
    }
  }, [fetchChangelog, changelogLoading, changelogHasMore, changelogOffset]);

  const fetchCustomerName = useCallback(async () => {
    try {
      setLoading(true);
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient
        .from('customers')
        .select('name')
        .eq('id', customerId)
        .single();

      if (error) {
        console.error('[CustomerOrderScreen] Error fetching customer:', error);
        setCustomerName('Customer');
      } else {
        setCustomerName(data?.name || 'Customer');
      }
    } catch (error) {
      console.error('[CustomerOrderScreen] Exception:', error);
      setCustomerName('Customer');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (!userProfile && (!user || !session)) {
      router.replace('/login');
      return;
    }

    if (!customerId) {
      router.back();
      return;
    }

    fetchCustomerName();
  }, [user, session, userProfile, customerId, fetchCustomerName]);

  if (!userProfile && (!user || !session)) {
    return null; // Will redirect in useEffect
  }

  if (!customerId) {
    return null; // Will redirect in useEffect
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={t.brand.tint} accessibilityLabel="Loading customer" />
        <Text style={styles.loadingText}>Loading customer…</Text>
      </View>
    );
  }

  return (
    <>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        {/* Object page header (style guide §13.8): surface.header, brand.tint actions */}
        <View style={styles.customHeader}>
          <View style={[styles.customHeaderContent, { paddingTop: insets.top }]}>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Icon
                name={Platform.OS === 'ios' ? 'chevron-left' : 'arrow-left'}
                size={iconSize.lg}
                color={t.brand.tint}
              />
            </Pressable>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle} numberOfLines={2} accessibilityRole="header">
                Order for {customerName}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              onPress={handleOpenChangelog}
              accessibilityLabel="View order history"
              accessibilityRole="button"
            >
              <Icon name="history" size={iconSize.lg} color={t.brand.tint} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              onPress={handleOpenItemCatalog}
              accessibilityLabel="Add items to order"
              accessibilityRole="button"
            >
              <Icon name="plus" size={iconSize.lg} color={t.brand.tint} />
            </Pressable>
          </View>
        </View>

        {/* Main Content Area */}
        <View style={styles.container}>
          <OrderManagement
            customerId={customerId}
            itemCatalogOpen={showItemCatalog}
            onOpenItemCatalog={handleOpenItemCatalog}
            onCloseItemCatalog={handleCloseItemCatalog}
          />
        </View>

        {/* Changelog Bottom Sheet */}
        <ChangeLogBottomSheet
          isVisible={changelogVisible}
          onClose={() => setChangelogVisible(false)}
          customer={{
            id: customerId,
            name: customerName,
            total_active_items: 0,
            total_active_quantity: 0,
            last_activity_at: new Date().toISOString(),
          }}
          entries={changelogEntries}
          loading={changelogLoading}
          analytics={changelogAnalytics}
          onLoadMore={handleLoadMoreChangelog}
          hasMore={changelogHasMore}
          error={changelogError}
        />
      </View>
    </>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  screen: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.lg,
  },
  // Header extends behind the status bar; no shadow, hairline bottom
  customHeader: {
    backgroundColor: t.surface.header,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  customHeaderContent: {
    // paddingTop is set dynamically with insets
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.xs,
    paddingBottom: space.xs,
  },
  headerTitleContainer: {
    flex: 1,
    marginHorizontal: space.xs,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  iconButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
});
