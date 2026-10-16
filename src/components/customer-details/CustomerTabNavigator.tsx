/**
 * CustomerTabNavigator: thin wrapper around GenericDetailTabNavigator for the customer page (style guide §14.2):
 * Overview and Pricing. The page draws it only for a role that may open Item pricing.
 */
import React, { useMemo } from 'react';
import { GenericDetailTabNavigator, TAB_ICONS, type TabConfig } from '@/components/common/GenericDetailTabNavigator';
import { t as tr } from '@/i18n';

export type CustomerTabKey = 'overview' | 'pricing';

interface CustomerTabNavigatorProps {
  activeTab: CustomerTabKey;
  onTabChange: (tab: CustomerTabKey) => void;
}

export const CustomerTabNavigator: React.FC<CustomerTabNavigatorProps> = ({ activeTab, onTabChange }) => {
  const tabs = useMemo<TabConfig<CustomerTabKey>[]>(() => [
    { key: 'overview', label: tr('customers.page.tabOverview'), icon: TAB_ICONS.overview },
    { key: 'pricing', label: tr('pricing.customerTab.title'), icon: TAB_ICONS.pricing },
  ], []);
  return <GenericDetailTabNavigator tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />;
};

export default CustomerTabNavigator;
