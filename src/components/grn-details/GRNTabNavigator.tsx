/**
 * GRNTabNavigator Component - SAP Fiori Compliant
 * Thin wrapper around GenericDetailTabNavigator for GRN details
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

export type TabKey = 'overview' | 'items' | 'dispatches' | 'images' | 'invoices';

interface GRNTabNavigatorProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  item_count?: number;
  dispatch_count?: number;
  image_count?: number;
  invoice_count?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const GRNTabNavigator: React.FC<GRNTabNavigatorProps> = ({
  activeTab,
  onTabChange,
  item_count = 0,
  dispatch_count = 0,
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
      key: 'dispatches',
      label: 'Dispatches',
      icon: TAB_ICONS.dispatches,
      badgeCount: dispatch_count > 0 ? dispatch_count : undefined,
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
  ], [item_count, dispatch_count, image_count, invoice_count]);

  return (
    <GenericDetailTabNavigator
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={onTabChange}
    />
  );
};

export default GRNTabNavigator;
