/**
 * InvoiceTabNavigator Component - SAP Fiori Compliant
 * Thin wrapper around GenericDetailTabNavigator for Invoice details
 */

import React, { useMemo } from 'react';
import {
  GenericDetailTabNavigator,
  TAB_ICONS,
  type TabConfig,
} from '@/components/common/GenericDetailTabNavigator';

// ============================================================================
// TYPES
// ============================================================================

export type TabKey = 'overview' | 'items' | 'breakdown';

interface InvoiceTabNavigatorProps {
  active_tab: TabKey;
  on_tab_change: (tab: TabKey) => void;
  item_count?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const InvoiceTabNavigator: React.FC<InvoiceTabNavigatorProps> = ({
  active_tab,
  on_tab_change,
  item_count = 0,
}) => {
  const tabs = useMemo<TabConfig<TabKey>[]>(() => [
    {
      key: 'overview',
      label: 'Overview',
      icon: TAB_ICONS.overview,
    },
    {
      key: 'items',
      label: 'Line Items',
      icon: TAB_ICONS.lineItems,
      badgeCount: item_count > 0 ? item_count : undefined,
    },
    {
      key: 'breakdown',
      label: 'Breakdown',
      icon: TAB_ICONS.breakdown,
    },
  ], [item_count]);

  return (
    <GenericDetailTabNavigator
      tabs={tabs}
      activeTab={active_tab}
      onTabChange={on_tab_change}
      iconSize={24}
    />
  );
};

export default InvoiceTabNavigator;
