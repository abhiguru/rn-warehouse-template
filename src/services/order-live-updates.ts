import { subscribeToTableChanges } from '@/services/table-live-updates';

/** Follows `public.orders` (see table-live-updates.ts for the rules every table shares). */
export const subscribeToOrderChanges = (refresh: () => void | Promise<void>) =>
  subscribeToTableChanges({ table: 'orders', channel: 'warehouse-orders' }, refresh);
