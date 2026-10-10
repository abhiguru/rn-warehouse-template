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

type OrdersView = 'orders' | 'queue';

const VIEW_OPTIONS: { value: OrdersView; label: string }[] = [
  { value: 'orders', label: 'Orders' },
  { value: 'queue', label: 'Queue' },
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
        options={VIEW_OPTIONS}
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
