/**
 * ItemTabNavigator: thin wrapper around GenericDetailTabNavigator for the item page (style guide §14.2):
 * Overview and Pricing. The page draws it only for a role that may open Item pricing.
 */
import React, { useMemo } from 'react';
import { GenericDetailTabNavigator, TAB_ICONS, type TabConfig } from '@/components/common/GenericDetailTabNavigator';
import { t as tr } from '@/i18n';

export type ItemTabKey = 'overview' | 'pricing';

interface ItemTabNavigatorProps {
  activeTab: ItemTabKey;
  onTabChange: (tab: ItemTabKey) => void;
}

export const ItemTabNavigator: React.FC<ItemTabNavigatorProps> = ({ activeTab, onTabChange }) => {
  const tabs = useMemo<TabConfig<ItemTabKey>[]>(() => [
    { key: 'overview', label: tr('items.page.tabOverview'), icon: TAB_ICONS.overview },
    { key: 'pricing', label: tr('pricing.customerTab.title'), icon: TAB_ICONS.pricing },
  ], []);
  return <GenericDetailTabNavigator tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />;
};

export default ItemTabNavigator;
