/**
 * Orders Tab (Home Screen)
 *
 * Customers see their orders. Warehouse roles (admin, supervisor, staff) also
 * get an "Orders | Queue" switch under the header: Queue is the same orders as
 * a work list with items, for editing and generating dispatches.
 * Auth is handled by the parent (tabs)/_layout.tsx.
 */

import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { layout, space } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { OrderFlashList, SupervisorOrderQueueList } from '@/components/lists';
import { SegmentedControl } from '@/components/ui/RadioButton';
import { t } from '@/i18n';

type OrdersView = 'orders' | 'queue';

/** Built when drawn, so the labels follow the app's language (docs/I18N.md rule 2). */
const viewOptions = (): { value: OrdersView; label: string }[] => [
  { value: 'orders', label: t('nav.ordersView.orders') },
  { value: 'queue', label: t('nav.ordersView.queue') },
];

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  viewSwitch: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
  },
  // The bar supplies the page margin, so drop the control's own form-cell padding.
  viewSwitchControl: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});

export default function OrdersTab() {
  const styles = useThemedStyles(makeStyles);
  const { canManageOrders } = useRoleBasedAccess();
  const [view, setView] = useState<OrdersView>('orders');

  // Customer accounts have no queue, so they get no switch either.
  const viewSwitch = canManageOrders ? (
    <View style={styles.viewSwitch}>
      <SegmentedControl
        value={view}
        onValueChange={(value) => setView(value as OrdersView)}
        options={viewOptions()}
        style={styles.viewSwitchControl}
      />
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      {canManageOrders && view === 'queue' ? (
        <SupervisorOrderQueueList subHeader={viewSwitch} />
      ) : (
        <OrderFlashList subHeader={viewSwitch} />
      )}
    </View>
  );
}
