/** Pieces every list configuration uses to turn filter values into request parameters. */
import { endOfDayIST, startOfDayIST } from '@/utils/formatters';
import type { FilterContext, PickedOption } from '../types';

/**
 * Start and end of a calendar day as moments, so the last day is included in full.
 * The list RPCs read these as timestamps; the day is the user's day in India.
 */
export const startOfDay = startOfDayIST;
export const endOfDay = endOfDayIST;

/** The ids of a picker field's value. */
export const ids = (value: unknown) => (Array.isArray(value) ? (value as PickedOption[]).map(option => option.id) : []);

/** A customer filter is offered to warehouse roles, and to customer accounts with a choice to make. */
export const customerFilterVisible = (ctx: FilterContext) => ctx.isWarehouseRole || ctx.assignedCustomers.length > 1;
