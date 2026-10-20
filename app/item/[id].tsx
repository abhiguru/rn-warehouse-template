/**
 * Item page (object page, style guide §14.2): what the item is, the way to Edit, deactivate or delete it, and its
 * default rate. Opened from the Items list (and from every link to an item's rates, on the Pricing tab); Edit pushes
 * the one-page form (app/item-edit/[id].tsx). Built like the customer page (app/customer/[id].tsx).
 *
 * Loads by the route's id each time the page comes into focus, so a name just edited shows. The Pricing tab is for the
 * roles that may open Item pricing; `tab=pricing` opens it.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { ItemOverviewTab } from '@/components/item-details/ItemOverviewTab';
import { ItemTabNavigator, type ItemTabKey } from '@/components/item-details/ItemTabNavigator';
import { ItemPricingTab } from '@/features/item-pricing/components/ItemPricingTab';
import { reloadItemRatesCache } from '@/features/item-pricing/useItemRates';
import { deleteItemFlow } from '@/features/items/deleteItemFlow';
import { showActivatedToast, showDeactivatedToast } from '@/features/items/activationToast';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { SkeletonBox } from '@/components/skeletons/SkeletonBox';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { canOpenScreen } from '@/config/roles';
import { itemService } from '@/services/item-service';
import { useAppSelector } from '@/store/hooks';
import type { Item } from '@/types/item.types';
import { iconSize, layout, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { showAlert } from '@/utils/alert';
import { serverText } from '@/utils/serverText';

export default function ItemPage() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string | string[] }>();
  const isFocused = useIsFocused();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const role = useAppSelector(state => state.auth.userProfile?.role);
  // The Pricing tab is for the roles that may open Item pricing; anyone else sees the Overview alone, with no tab bar.
  const canSeePricing = canOpenScreen(role, 'itemPricing');
  const requestedTab = Array.isArray(tab) ? tab[0] : tab;
  const [chosenTab, setActiveTab] = useState<ItemTabKey>(requestedTab === 'pricing' ? 'pricing' : 'overview');
  const activeTab: ItemTabKey = canSeePricing ? chosenTab : 'overview';
  const [item, setItem] = useState<Item | null>(null);
  // The read failed (no connection, a timeout): the screen can try again.
  const [failed, setFailed] = useState(false);
  // The server answered and there is no such item (someone deleted it).
  const [notFound, setNotFound] = useState(false);
  const offline = useIsOffline();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const currentId = useRef(id);
  const deleting = useRef(false);
  currentId.current = id;

  useEffect(() => {
    if (!isFocused || !id) return;
    let ignore = false;
    void (async () => {
      let result;
      try {
        result = await itemService.getItemById(id);
      } catch {
        result = { success: false } as const;
      }
      // Only the item on the screen now may fill it.
      if (ignore || currentId.current !== id) return;
      if (result.success && result.data) {
        setItem(result.data);
        setFailed(false);
        setNotFound(false);
      } else if ('code' in result && result.code === 'NOT_FOUND') {
        // Gone: the page says so instead of offering to try again.
        setItem(null);
        setFailed(false);
        setNotFound(true);
      } else {
        setFailed(true);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [id, isFocused, attempt]);

  // Another item's page never shows the last one's details.
  const shown = item && item.id === id ? item : null;

  const setActive = useCallback(
    async (active: boolean) => {
      if (!shown) return;
      const failTitle = tr(active ? 'items.list.couldNotActivateTitle' : 'items.list.couldNotDeactivateTitle');
      if (offline) {
        showAlert(failTitle, tr('items.offline.connectToSave'), [{ text: tr('common.ok') }]);
        return;
      }
      setBusy(true);
      try {
        const result = await itemService.toggleItemActive(shown.id, active);
        if (result.success) {
          setItem({ ...shown, active });
          if (active) showActivatedToast(shown.name, result.rateSource);
          else showDeactivatedToast(shown.name);
          // The rates held list active items only: read them again so the Items list and the strip follow.
          void reloadItemRatesCache();
        } else if (result.code === 'NOT_FOUND') {
          setItem(null);
          setNotFound(true);
        } else {
          showAlert(failTitle, serverText(result, tr('items.list.tryAgainInAMoment'), { write: true, form: true }), [{ text: tr('common.ok') }]);
        }
      } catch {
        showAlert(tr('items.list.couldNotUpdateTitle'), tr('common.checkConnection'), [{ text: tr('common.ok') }]);
      } finally {
        setBusy(false);
      }
    },
    [shown, offline]
  );

  // Deactivating asks first (like customers); activating again happens straight away.
  const onToggleActive = useCallback(() => {
    if (!shown) return;
    if (!shown.active) {
      void setActive(true);
      return;
    }
    // Offline: say so now, not after a question that could only end in that message.
    if (offline) {
      showAlert(tr('items.list.couldNotDeactivateTitle'), tr('items.offline.connectToSave'), [{ text: tr('common.ok') }]);
      return;
    }
    showAlert(tr('items.list.deactivateConfirmTitle', { name: shown.name }), tr('items.list.deactivateConfirmMessage'), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('items.list.deactivateItem'), style: 'destructive', onPress: () => void setActive(false) },
    ]);
  }, [shown, setActive, offline]);

  // Deleting asks first (it takes the item's rates with it); an item in use can be deactivated instead.
  const onDelete = useCallback(() => {
    // A ref, not the state: a second tap in the same moment must find the first one already taken.
    if (!shown || deleting.current) return;
    deleting.current = true;
    // Busy from the tap until the person cancels or the server has answered the delete.
    setBusy(true);
    void deleteItemFlow(
      { id: shown.id, name: shown.name, active: shown.active },
      {
        // The item is gone: back to the Items list.
        onDeleted: () => router.dismissTo('/items'),
        onDeactivate: () => setActive(false),
        offline,
        form: true,
      }
    ).finally(() => {
      deleting.current = false;
      setBusy(false);
    });
  }, [shown, setActive, offline]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <View style={styles.navigationBar}>
        <HeaderBackButton style={styles.navSide} />
        <Text style={styles.navTitle} accessibilityRole={shown ? 'header' : undefined} numberOfLines={2}>
          {shown?.name ?? ''}
        </Text>
        <View style={[styles.navSide, styles.navEnd]}>
          {shown && (
            <Button type="tertiary" onPress={() => router.push({ pathname: '/item-edit/[id]', params: { id: shown.id } })}>
              {tr('common.edit')}
            </Button>
          )}
        </View>
      </View>

      {!shown && !failed && !notFound && (
        <View style={styles.state} accessibilityRole="progressbar" accessibilityLabel={tr('items.form.loadingLabel')}>
          <SkeletonBox width="100%" height={touchTarget * 2} />
          <SkeletonBox width="100%" height={touchTarget} />
          <SkeletonBox width="100%" height={touchTarget} />
        </View>
      )}

      {!shown && notFound && (
        <View style={styles.state} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.stateText}>{tr('items.form.notFoundSentence')}</Text>
          <Button type="secondary" onPress={() => router.back()}>
            {tr('common.goBack')}
          </Button>
        </View>
      )}

      {!shown && failed && (
        <View style={styles.state} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.stateText}>{tr('items.page.loadFailed')}</Text>
          <Button
            type="secondary"
            leftIcon="refresh"
            onPress={() => {
              setFailed(false);
              setAttempt(count => count + 1);
            }}
          >
            {tr('common.retry')}
          </Button>
        </View>
      )}

      {shown && canSeePricing && <ItemTabNavigator activeTab={activeTab} onTabChange={setActiveTab} />}

      {shown && activeTab === 'overview' && (
        <ItemOverviewTab item={shown} busy={busy} onToggleActive={onToggleActive} onDelete={onDelete} />
      )}

      {shown && activeTab === 'pricing' && <ItemPricingTab itemId={shown.id} itemName={shown.name} active={shown.active} />}
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  root: { flex: 1, backgroundColor: t.background.base },
  navigationBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  navSide: { minWidth: 80 },
  navEnd: { alignItems: 'flex-end' as const },
  navTitle: { ...typography.headline, color: t.text.primary, flexShrink: 1, textAlign: 'center' as const },
  state: { flex: 1, padding: layout.marginCompact, gap: space.md, justifyContent: 'center' as const },
  stateText: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
});
