/**
 * DispatchTabNavigator Component - SAP Fiori Compliant
 * Thin wrapper around GenericDetailTabNavigator for Dispatch details
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

export type TabKey = 'overview' | 'items' | 'grns' | 'images' | 'invoices';

// Using snake_case to match backend patterns
interface DispatchTabNavigatorProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  item_count?: number;
  grn_count?: number;
  image_count?: number;
  invoice_count?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const DispatchTabNavigator: React.FC<DispatchTabNavigatorProps> = ({
  activeTab,
  onTabChange,
  item_count = 0,
  grn_count = 0,
  image_count = 0,
  invoice_count = 0,
}) => {
  const tabs = useMemo<TabConfig<TabKey>[]>(() => [
    {
      key: 'overview',
      label: 'Overview',
      icon: TAB_ICONS.overview,
    },
    {
      key: 'items',
      label: 'Items',
      icon: TAB_ICONS.items,
      badgeCount: item_count > 0 ? item_count : undefined,
    },
    {
      key: 'grns',
      label: 'GRNs',
      icon: TAB_ICONS.grns,
      badgeCount: grn_count > 0 ? grn_count : undefined,
    },
    {
      key: 'images',
      label: 'Images',
      icon: TAB_ICONS.images,
      badgeCount: image_count > 0 ? image_count : undefined,
    },
    {
      key: 'invoices',
      label: 'Invoices',
      icon: TAB_ICONS.invoices,
      badgeCount: invoice_count > 0 ? invoice_count : undefined,
    },
  ], [item_count, grn_count, image_count, invoice_count]);

  return (
    <GenericDetailTabNavigator
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={onTabChange}
    />
  );
};

export default DispatchTabNavigator;
