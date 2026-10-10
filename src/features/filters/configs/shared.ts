/** Pieces every list configuration uses to turn filter values into request parameters. */
import { parseLocalISODate } from '@/utils/formatters';
import type { FilterContext, PickedOption } from '../types';

/** Start and end of a local calendar day as timestamps, so the last day is included in full. */
export const startOfDay = (iso: string) => parseLocalISODate(iso).toISOString();
export const endOfDay = (iso: string) => {
  const date = parseLocalISODate(iso);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
};

/** The ids of a picker field's value. */
export const ids = (value: unknown) => (Array.isArray(value) ? (value as PickedOption[]).map(option => option.id) : []);

/** A customer filter is offered to warehouse roles, and to customer accounts with a choice to make. */
export const customerFilterVisible = (ctx: FilterContext) => ctx.isWarehouseRole || ctx.assignedCustomers.length > 1;
