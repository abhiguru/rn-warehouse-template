/**
 * Customer page (object page, style guide §14.2): who the customer is, how to
 * reach them, and the way to Edit or deactivate them. Opened from the
 * Customers list; Edit pushes the one-page form (app/customer-edit/[id].tsx).
 *
 * Loads by the route's id each time the page comes into focus, so a name just
 * edited shows. A section appears only when it has a value. When a reload fails
 * the details already shown stay, with a strip that says since when they are from.
 * A load that was asked for before Deactivate / Activate finished never undoes it.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { CustomerOverviewTab } from '@/components/customer-details/CustomerOverviewTab';
import { CustomerTabNavigator, type CustomerTabKey } from '@/components/customer-details/CustomerTabNavigator';
import { CustomerPricingTab } from '@/features/item-pricing/components/CustomerPricingTab';
import { DetailSkeleton } from '@/components/skeletons/DetailSkeleton';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { canOpenScreen } from '@/config/roles';
import { customerService } from '@/services/customer-service';
import { useAppSelector } from '@/store/hooks';
import type { Customer } from '@/types/customer.types';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { needsConnectionLabel, useNeedsConnectionV3 } from '@/features/phone-copy/useNeedsConnection';
import { showAlert } from '@/utils/alert';
import { formatTime } from '@/utils/formatters';
import { serverText, transportText } from '@/utils/serverText';
import { showToast } from '@/utils/toast';

export default function CustomerPage() {
  const { id, tab, item } = useLocalSearchParams<{ id: string; tab?: string | string[]; item?: string | string[] }>();
  const isFocused = useIsFocused();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const needsConnection = useNeedsConnectionV3();
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
  // When the details on the screen were read, for "Showing details from ...".
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  // When Deactivate / Activate last succeeded: a load that began before it must not flip `active` back.
  const toggledAt = useRef(0);
  const busyRef = useRef(false);
  const currentId = useRef(id);
  currentId.current = id;

  useEffect(() => {
    if (!isFocused || !id) return;
    let ignore = false;
    const startedAt = Date.now();
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
        // The answer was asked for before the customer was deactivated or activated: keep what that left.
        const loaded = result.data;
        setCustomer(previous =>
          toggledAt.current > startedAt && previous && previous.id === loaded.id ? { ...loaded, active: previous.active } : loaded
        );
        setLoadedAt(new Date());
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
      if (!shown || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const result = active
          ? await customerService.restoreCustomer(shown.id)
          : await customerService.inactivateCustomer(shown.id);
        if (result.success) {
          toggledAt.current = Date.now();
          setCustomer(previous => ({ ...(previous && previous.id === shown.id ? previous : shown), active }));
          showToast(tr(active ? 'customers.list.activatedToast' : 'customers.list.deactivatedToast', { name: shown.name }));
        } else if (active && result.code === 'DUPLICATE_MOBILE' && result.details?.name) {
          // Another active customer uses the number: this one stays deactivated.
          const other = result.details;
          showAlert(
            tr('customers.list.couldNotActivateNamed', { name: shown.name }),
            tr('customers.list.mobileInUse', { other: other.name }),
            [
              { text: tr('common.ok') },
              ...(other.customer_id
                ? [{ text: tr('customers.list.openOther', { other: other.name }), onPress: () => router.push({ pathname: '/customer/[id]', params: { id: other.customer_id as string } }) }]
                : []),
            ]
          );
        } else {
          showAlert(
            tr(active ? 'customers.list.couldNotActivateTitle' : 'customers.list.couldNotDeactivateTitle'),
            serverText(result, tr('customers.list.tryAgainInAMoment'), { write: true, form: true, code: result.code }),
            [{ text: tr('common.ok') }]
          );
        }
      } catch (error) {
        showAlert(
          tr('customers.list.couldNotUpdateTitle'),
          transportText(error, { write: true, form: true }) ?? tr('common.checkConnection'),
          [{ text: tr('common.ok') }]
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [shown]
  );

  const onToggleActive = useCallback(() => {
    if (!shown || busyRef.current) return;
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
    <View style={styles.root}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: t.surface.header },
          headerTintColor: t.brand.tint,
          headerShadowVisible: false,
          headerTitleAlign: 'center',
          title: shown?.name ?? '',
          headerTitle: () =>
            shown ? (
              <Text style={styles.navTitle} numberOfLines={2} accessibilityRole="header" maxFontSizeMultiplier={1.5}>
                {shown.name}
              </Text>
            ) : null,
          headerLeft: () => <HeaderBackButton />,
          headerRight: () =>
            shown ? (
              <Button
                type="tertiary"
                onPress={() => router.push({ pathname: '/customer-edit/[id]', params: { id: shown.id } })}
                // Offline the reason is in the label only; the Overview's actions carry the visible line (Design 2.5).
                disabled={needsConnection}
                testID="customer-details-edit"
                accessibilityLabel={needsConnection ? needsConnectionLabel(tr('common.edit')) : undefined}
              >
                {tr('common.edit')}
              </Button>
            ) : null,
        }}
      />

      {!shown && !failed && <DetailSkeleton tabCount={canSeePricing ? 2 : 1} cardCount={3} />}

      {!shown && failed && (
        <ErrorStateView
          title={tr('customers.page.loadFailedTitle')}
          message={tr('common.checkConnection')}
          onRetry={() => {
            setFailed(false);
            setAttempt(count => count + 1);
          }}
        />
      )}

      {shown && failed && (
        <View style={styles.refreshStrip}>
          <InlineValidation variant="error" message={tr('customers.page.refreshFailed', { time: formatTime(loadedAt) })} />
          <Button
            type="tertiary"
            onPress={() => {
              setFailed(false);
              setAttempt(count => count + 1);
            }}
            style={styles.refreshRetry}
          >
            {tr('common.retry')}
          </Button>
        </View>
      )}

      {shown && !shown.active && (
        <View style={styles.refreshStrip} testID="customer-deactivated">
          <InlineValidation variant="warning" message={tr('pricing.customerTab.deactivated')} />
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
          deactivated={!shown.active}
          openItemId={autoItem.current}
          onOpened={() => { autoItem.current = undefined; }}
        />
      )}
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  root: { flex: 1, backgroundColor: t.background.base },
  navTitle: { ...typography.headline, color: t.text.primary, textAlign: 'center' as const },
  refreshStrip: { paddingHorizontal: layout.marginCompact, paddingTop: space.sm },
  refreshRetry: { alignSelf: 'flex-start' as const, paddingHorizontal: space.sm },
});
