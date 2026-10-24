import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
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
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { t as tr } from '@/i18n';
import { isWarehouseUser } from '@/config/roles';

export default function CustomerOrderScreen() {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  // A yes or no, not the auth objects: a token renewal or a profile read gives
  // new objects for the same person, and nothing here should run again for that.
  const signedIn = useAppSelector(
    (state) => Boolean(state.auth.userProfile) || Boolean(state.auth.user && state.auth.session)
  );
  const staffView = useAppSelector((state) => isWarehouseUser(state.auth.userProfile?.role));
  const insets = useSafeAreaInsets();
  const [customerName, setCustomerName] = useState<string>('');
  // The business whose name has been read. `loading` follows from it, so on a change of
  // `customerId` the very next render is the spinner: the editor of the old business is
  // unmounted at once, with its order and its picker, and no action can reach that order.
  const [loadedFor, setLoadedFor] = useState<string | undefined>(undefined);
  const loading = loadedFor !== customerId;
  const latestCustomerId = useRef(customerId);
  latestCustomerId.current = customerId;
  // `refusedFor`: the server refused to open the order (the only thing that disables "+"). The
  // record (`deactivatedFor`: `active === false`, deleted or not) only chooses the wording and the banner:
  // on an older facility (no migration 82) a deactivated business has `deleted_at` set too.
  const [refusedFor, setRefusedFor] = useState<string | undefined>(undefined);
  // The record could not be read for this business: a refusal then gets the plain sentence.
  const [unreadFor, setUnreadFor] = useState<string | undefined>(undefined);
  const businessRecordUnread = unreadFor !== undefined && unreadFor === customerId;
  const businessDeleted = refusedFor !== undefined && refusedFor === customerId;
  // The business the customer record says is deactivated in Customers: it still has its orders.
  const [deactivatedFor, setDeactivatedFor] = useState<string | undefined>(undefined);
  const businessDeactivated = deactivatedFor !== undefined && deactivatedFor === customerId;
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
      // History read for a business the screen has left is dropped.
      if (latestCustomerId.current !== customerId) return;

      if (result.success && result.data) {
        setChangelogEntries(prev =>
          offset === 0 ? result.data.changes : [...prev, ...result.data.changes]
        );
        setChangelogAnalytics(result.data.analytics);
        setChangelogHasMore(result.data.pagination.has_more);
        setChangelogOffset(offset);
      } else {
        setChangelogError(tr('orders.screen.historyError'));
      }
    } catch (error) {
      console.error('[CustomerOrderScreen] Error fetching changelog:', error);
      if (latestCustomerId.current !== customerId) return;
      setChangelogError(tr('orders.screen.historyError'));
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

  // `loading` starts true and ends with the first name. Reading the name again
  // never brings the spinner back: it would unmount the order and its picker.
  const fetchCustomerName = useCallback(async () => {
    const requestedFor = customerId;
    let name = tr('common.customer');
    let deactivated = false;
    let unread = false;
    try {
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient
        .from('customers')
        .select('name, active, deleted_at')
        .eq('id', requestedFor)
        .single();

      if (error) {
        console.error('[CustomerOrderScreen] Error fetching customer:', error);
        unread = true;
      } else {
        name = data?.name || name;
        deactivated = data?.active === false;
      }
    } catch (error) {
      console.error('[CustomerOrderScreen] Exception:', error);
      unread = true;
    }
    // The answer for a business the screen has left is dropped.
    if (latestCustomerId.current !== requestedFor) return;
    setCustomerName(name);
    setDeactivatedFor(deactivated ? requestedFor : undefined);
    setUnreadFor(unread ? requestedFor : undefined);
    // Every read of the record replaces an earlier refusal; the editor asks the server again anyway.
    setRefusedFor(undefined);
    setLoadedFor(requestedFor);
  }, [customerId]);

  // Another business in the same screen: nothing of the previous one stays. The editor is
  // already gone (`loading`); the picker's flag and the history sheet are closed here, so
  // the new order does not open with the old business's picker.
  const shownFor = useRef(customerId);
  useEffect(() => {
    if (shownFor.current === customerId) return;
    shownFor.current = customerId;
    setShowItemCatalog(false);
    setChangelogVisible(false);
    setChangelogEntries([]);
    setChangelogAnalytics(undefined);
    setChangelogHasMore(false);
    setChangelogOffset(0);
    setChangelogError(undefined);
    setCustomerName('');
  }, [customerId]);

  useEffect(() => {
    if (!signedIn) {
      router.replace('/login');
      return;
    }

    if (!customerId) {
      router.back();
      return;
    }

    fetchCustomerName();
  }, [signedIn, customerId, fetchCustomerName]);

  if (!signedIn) {
    return null; // Will redirect in useEffect
  }

  if (!customerId) {
    return null; // Will redirect in useEffect
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={t.brand.tint} accessibilityLabel={tr('customers.form.loadingLabel')} />
        <Text style={styles.loadingText}>{tr('customers.form.loading')}</Text>
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
            <HeaderBackButton />
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="middle" accessibilityRole="header">
                {tr('orders.screen.title', { name: customerName })}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              onPress={handleOpenChangelog}
              accessibilityLabel={tr('orders.screen.viewHistory')}
              accessibilityRole="button"
            >
              <Icon name="history" size={iconSize.lg} color={t.brand.tint} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              onPress={handleOpenItemCatalog}
              disabled={businessDeleted}
              accessibilityState={{ disabled: businessDeleted }}
              accessibilityLabel={tr('orders.screen.addItemsToOrder')}
              accessibilityRole="button"
            >
              <Icon name="plus" size={iconSize.lg} color={businessDeleted ? t.text.disabled : t.brand.tint} />
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
            staffView={staffView}
            businessDeactivated={businessDeactivated}
            businessRecordUnread={businessRecordUnread}
            onBusinessDeleted={() => setRefusedFor(customerId)}
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
  // Custom back button (same on every headerless screen): platform glyph,
  // brand.tint, the word "Back", at least touchTarget in size (§8)
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
