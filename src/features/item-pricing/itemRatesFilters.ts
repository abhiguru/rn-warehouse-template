/**
 * The Item pricing list's filter bar: Customer and Type. All of it is applied on
 * the phone over the rates already loaded, so there is no result count (`fetchCount`) and no
 * full "Sort and filter" page: a filter sheet's button reads "Show results", never "No prices
 * match" (P-02, P-35). The list does not register this in FILTER_CONFIGS.
 */
import { t } from '@/i18n';
import { countable } from '@/features/filters/configs';
import { ids } from '@/features/filters/configs/shared';
import { customerSource } from '@/features/filters/pickerSources';
import type { FilterListConfig } from '@/features/filters/types';
import type { PriceType } from '@/types/item-pricing.types';

export interface ItemRatesRequest {
  customerIds: string[];
  priceType: 'all' | PriceType;
}

export const ITEM_RATES_FILTERS: FilterListConfig<ItemRatesRequest> = {
  listKey: 'item-rates-list',
  // Labels are getters so they follow the app's language (docs/I18N.md rule 2).
  get title() { return t('pricing.list.title'); },
  noun: ['item', 'items'],
  // The search is the only way to find an item: every typed word anywhere in the name (P-07, P-39).
  search: { get placeholder() { return t('pricing.list.search'); }, dates: false, range: null },
  fields: [
    { kind: 'picker', key: 'customers', get label() { return t('common.customer'); }, icon: 'account', noun: ['customer', 'customers'], source: customerSource },
    {
      kind: 'choice',
      key: 'priceType',
      get label() { return t('pricing.list.filterType'); },
      icon: 'cash',
      defaultValue: 'all',
      options: [
        { value: 'all', get label() { return t('common.all'); } },
        { value: 'monthly', get label() { return t('filters.option.monthly'); } },
        { value: 'one_time', get label() { return t('filters.option.oneTime'); } },
      ],
    },
  ],
  fastFilters: ['customers', 'priceType'],

  toRequest(values) {
    const priceType = values.priceType === 'monthly' || values.priceType === 'one_time' ? values.priceType : 'all';
    return { customerIds: ids(values.customers), priceType };
  },
  // No fetchCount: nothing is counted on the server.
};

export const ITEM_RATES_CONFIG = countable(ITEM_RATES_FILTERS);
