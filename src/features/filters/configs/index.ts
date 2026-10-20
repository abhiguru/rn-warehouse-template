import type { FilterContext, FilterListDefinition, FilterValues, SortState } from '../types';
import { DISPATCH_FILTERS } from './dispatch';
import { GRN_FILTERS } from './grn';
import { INVOICE_FILTERS } from './invoice';
import { ORDER_FILTERS, ORDER_QUEUE_FILTERS } from './order';

/** A configuration with its request type hidden: the request is built and counted in one step. */
export interface CountableFilterList extends FilterListDefinition {
  /** Missing where the list has nothing to count with: the apply button then reads "Show results". */
  countResults?: (values: FilterValues, sort: SortState | undefined, ctx: FilterContext) => Promise<number>;
}

export const countable = <TRequest,>(config: FilterListDefinition & {
  toRequest: (values: FilterValues, sort: SortState | undefined, ctx: FilterContext) => TRequest;
  fetchCount?: (request: TRequest, ctx: FilterContext) => Promise<number>;
}): CountableFilterList => {
  const { fetchCount } = config;
  // Copy the property descriptors, not the values: a spread would read the label
  // getters once and keep the language the app started in (docs/I18N.md rule 2).
  return Object.defineProperties(
    fetchCount
      ? { countResults: (values: FilterValues, sort: SortState | undefined, ctx: FilterContext) => fetchCount(config.toRequest(values, sort, ctx), ctx) }
      : {},
    Object.getOwnPropertyDescriptors(config)
  ) as CountableFilterList;
};

/** Every list's filter configuration, by `listKey`. The full "Sort and filter" page looks its list up here. */
export const FILTER_CONFIGS: Record<string, CountableFilterList> = {
  [GRN_FILTERS.listKey]: countable(GRN_FILTERS),
  [DISPATCH_FILTERS.listKey]: countable(DISPATCH_FILTERS),
  [INVOICE_FILTERS.listKey]: countable(INVOICE_FILTERS),
  [ORDER_FILTERS.listKey]: countable(ORDER_FILTERS),
  [ORDER_QUEUE_FILTERS.listKey]: countable(ORDER_QUEUE_FILTERS),
};

/**
 * The configuration for a `listKey` that came from outside (a route parameter).
 * Only the app's own lists count: "__proto__" or "constructor" would otherwise
 * find a property that every object has.
 */
export function filterConfigFor(listKey: string | null | undefined): CountableFilterList | undefined {
  return listKey && Object.prototype.hasOwnProperty.call(FILTER_CONFIGS, listKey) ? FILTER_CONFIGS[listKey] : undefined;
}

export { DISPATCH_FILTERS, GRN_FILTERS, INVOICE_FILTERS, ORDER_FILTERS, ORDER_QUEUE_FILTERS };
