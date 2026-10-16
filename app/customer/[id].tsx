/**
 * Customer page (object page, style guide §14.2): who the customer is, how to
 * reach them, and the way to Edit or deactivate them. Opened from the
 * Customers list; Edit pushes the one-page form (app/customer-edit/[id].tsx).
 *
 * Loads by the route's id each time the page comes into focus, so a name just
 * edited shows. A section appears only when it has a value.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { CustomerOverviewTab } from '@/components/customer-details/CustomerOverviewTab';
import { CustomerTabNavigator, type CustomerTabKey } from '@/components/customer-details/CustomerTabNavigator';
import { CustomerPricingTab } from '@/features/item-pricing/components/CustomerPricingTab';
import { SkeletonBox } from '@/components/skeletons/SkeletonBox';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { canOpenScreen } from '@/config/roles';
import { customerService } from '@/services/customer-service';
import { useAppSelector } from '@/store/hooks';
import type { Customer } from '@/types/customer.types';
import { iconSize, layout, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { showAlert } from '@/utils/alert';
import { serverText } from '@/utils/serverText';

export default function CustomerPage() {
  const { id, tab, item } = useLocalSearchParams<{ id: string; tab?: string | string[]; item?: string | string[] }>();
  const isFocused = useIsFocused();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const role = useAppSelector(state => state.auth.userProfile?.role);
  // The Pricing tab is for the roles that may open Item pricing; anyone else sees the Overview alone, with no tab bar.
  const canSeePricing = canOpenScreen(role, 'itemPricing');
  const requestedTab = Array.isArray(tab) ? tab[0] : tab;
  const [chosenTab, setActiveTab] = useState<CustomerTabKey>(requestedTab === 'pricing' ? 'pricing' : 'overview');
  const activeTab: CustomerTabKey = canSeePricing ? chosenTab : 'overview';
  // A link into the tab may name an item (`item`): its box opens once, so Back lands on the tab.
  const autoItem = useRef<string | undefined>((Array.isArray(item) ? item[0] : item) || undefined);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const currentId = useRef(id);
  currentId.current = id;

  useEffect(() => {
    if (!isFocused || !id) return;
    let ignore = false;
    void (async () => {
      let result;
      try {
        result = await customerService.getCustomerById(id);
      } catch {
        result = { success: false } as const;
      }
      // Only the customer on the screen now may fill it.
      if (ignore || currentId.current !== id) return;
      if (result.success && result.data) {
        setCustomer(result.data);
        setFailed(false);
      } else {
        setFailed(true);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [id, isFocused, attempt]);

  // Another customer's page never shows the last one's details.
  const shown = customer && customer.id === id ? customer : null;

  const setActive = useCallback(
    async (active: boolean) => {
      if (!shown) return;
      setBusy(true);
      try {
        const result = active
          ? await customerService.restoreCustomer(shown.id)
          : await customerService.inactivateCustomer(shown.id);
        if (result.success) {
          setCustomer({ ...shown, active });
        } else {
          showAlert(
            tr(active ? 'customers.list.couldNotActivateTitle' : 'customers.list.couldNotDeactivateTitle'),
            serverText(result.message, tr('customers.list.tryAgainInAMoment')),
            [{ text: tr('common.ok') }]
          );
        }
      } catch {
        showAlert(tr('customers.list.couldNotUpdateTitle'), tr('common.checkConnection'), [{ text: tr('common.ok') }]);
      } finally {
        setBusy(false);
      }
    },
    [shown]
  );

  const onToggleActive = useCallback(() => {
    if (!shown) return;
    if (!shown.active) {
      void setActive(true);
      return;
    }
    showAlert(
      tr('customers.list.deactivateConfirmTitle', { name: shown.name }),
      tr('customers.list.deactivateConfirmMessage'),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        { text: tr('customers.list.deactivateCustomer'), style: 'destructive', onPress: () => void setActive(false) },
      ]
    );
  }, [shown, setActive]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <View style={styles.navigationBar}>
        <HeaderBackButton style={styles.navSide} />
        <Text style={styles.navTitle} accessibilityRole={shown ? 'header' : undefined}>
          {shown?.name ?? ''}
        </Text>
        <View style={[styles.navSide, styles.navEnd]}>
          {shown && (
            <Button
              type="tertiary"
              onPress={() => router.push({ pathname: '/customer-edit/[id]', params: { id: shown.id } })}
            >
              {tr('common.edit')}
            </Button>
          )}
        </View>
      </View>

      {!shown && !failed && (
        <View style={styles.state} accessibilityRole="progressbar" accessibilityLabel={tr('customers.form.loadingLabel')}>
          <SkeletonBox width="100%" height={touchTarget * 2} />
          <SkeletonBox width="100%" height={touchTarget} />
          <SkeletonBox width="100%" height={touchTarget} />
        </View>
      )}

      {!shown && failed && (
        <View style={styles.state} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.stateText}>{tr('customers.page.loadFailed')}</Text>
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

      {shown && canSeePricing && (
        <CustomerTabNavigator activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      {shown && activeTab === 'overview' && (
        <CustomerOverviewTab customer={shown} busy={busy} onToggleActive={onToggleActive} />
      )}

      {shown && activeTab === 'pricing' && (
        <CustomerPricingTab
          customerId={shown.id}
          customerName={shown.name}
          openItemId={autoItem.current}
          onOpened={() => { autoItem.current = undefined; }}
        />
      )}
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
