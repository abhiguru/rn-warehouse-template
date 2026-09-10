import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, StatusBar, Platform, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from '@/store/hooks';
import { router } from 'expo-router';
import OrderManagement from '@/components/OrderManagement';
import ChangeLogBottomSheet from '@/components/ChangeLogBottomSheet';
import { ChangeLogService } from '@/services/change-log-service';
import type { ChangeLogEntry, ChangeLogAnalytics, CustomerSummary } from '@/types/order.types';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function CustomerOrderScreen() {
  // Theme colors for dark mode support
  const colors = useListColors();

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
        setChangelogError(result.error?.message || 'Failed to load changelog');
      }
    } catch (error) {
      console.error('[CustomerOrderScreen] Error fetching changelog:', error);
      setChangelogError('Failed to load changelog');
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
  }, [user, session, customerId]);

  // Configure StatusBar for this screen
  useEffect(() => {
    if (Platform.OS === 'android') {
      StatusBar.setBarStyle('light-content');
      StatusBar.setBackgroundColor('transparent');
      StatusBar.setTranslucent(true); // Allow header to extend into status bar
    }
  }, []);

  const fetchCustomerName = async () => {
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
        setCustomerName('Customer Order');
      } else {
        setCustomerName(data?.name || 'Customer Order');
      }
    } catch (error) {
      console.error('[CustomerOrderScreen] Exception:', error);
      setCustomerName('Customer Order');
    } finally {
      setLoading(false);
    }
  };

  if (!userProfile && (!user || !session)) {
    return null; // Will redirect in useEffect
  }

  if (!customerId) {
    return null; // Will redirect in useEffect
  }

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.gray50 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.gray600 }]}>Loading customer...</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: colors.gray50 }}>
        {/* Custom Header that extends behind status bar */}
        <View style={[styles.customHeader, { backgroundColor: colors.primary }]}>
          {/* Orange background extends to top of screen */}
          <View style={[styles.customHeaderContent, { paddingTop: insets.top }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Icon name="arrow-left" size={24} color={colors.cellBackground} />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={[styles.headerTitle, { color: colors.cellBackground }]} numberOfLines={1}>
                Order for {customerName}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleOpenChangelog}
              accessibilityLabel="View order history"
              accessibilityRole="button"
            >
              <Icon name="history" size={22} color={colors.cellBackground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleOpenItemCatalog}
              accessibilityLabel="Add item to order"
              accessibilityRole="button"
            >
              <Icon name="plus" size={24} color={colors.cellBackground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Content Area */}
        <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.base,
  },
  // Custom Header Styles
  customHeader: {
    // No paddingTop here - header extends to very top of screen
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 4,
  },
  customHeaderContent: {
    // paddingTop is set dynamically with insets
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 8, // Padding below the header content
  },
  backButton: {
    padding: 8,
    marginRight: 4,
  },
  headerTitleContainer: {
    flex: 1,
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '500',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
});