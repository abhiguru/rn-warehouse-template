import type { FilterContext, FilterListDefinition, FilterValues, SortState } from '../types';
import { DISPATCH_FILTERS } from './dispatch';
import { GRN_FILTERS } from './grn';
import { INVOICE_FILTERS } from './invoice';
import { ORDER_FILTERS, ORDER_QUEUE_FILTERS } from './order';

/** A configuration with its request type hidden: the request is built and counted in one step. */
export interface CountableFilterList extends FilterListDefinition {
  countResults: (values: FilterValues, sort: SortState | undefined, ctx: FilterContext) => Promise<number>;
}

const countable = <TRequest,>(config: FilterListDefinition & {
  toRequest: (values: FilterValues, sort: SortState | undefined, ctx: FilterContext) => TRequest;
  fetchCount: (request: TRequest, ctx: FilterContext) => Promise<number>;
}): CountableFilterList => ({
  ...config,
  countResults: (values, sort, ctx) => config.fetchCount(config.toRequest(values, sort, ctx), ctx),
});

/** Every list's filter configuration, by `listKey`. The full "Sort and filter" page looks its list up here. */
export const FILTER_CONFIGS: Record<string, CountableFilterList> = {
  [GRN_FILTERS.listKey]: countable(GRN_FILTERS),
  [DISPATCH_FILTERS.listKey]: countable(DISPATCH_FILTERS),
  [INVOICE_FILTERS.listKey]: countable(INVOICE_FILTERS),
  [ORDER_FILTERS.listKey]: countable(ORDER_FILTERS),
  [ORDER_QUEUE_FILTERS.listKey]: countable(ORDER_QUEUE_FILTERS),
};

export { DISPATCH_FILTERS, GRN_FILTERS, INVOICE_FILTERS, ORDER_FILTERS, ORDER_QUEUE_FILTERS };
