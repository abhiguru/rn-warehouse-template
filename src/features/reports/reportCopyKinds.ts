/**
 * The kinds of records each report reads from the phone copy: a sync that changed one of them makes the report on
 * screen read again, quietly (WH-299, product/tech/app-offline-read-from-copy.md section 11.1).
 */
import type { EntityName } from '@/features/phone-copy/copySchema';

const GRN_KINDS: readonly EntityName[] = ['customers', 'goodsreceived', 'goodsreceived_trl'];

/** Stock summary and item stock: the receipts and lots, and the customers' names. */
export const STOCK_REPORT_KINDS: readonly EntityName[] = GRN_KINDS;
/** Stock ageing also counts the dispatches of each lot. */
export const STOCK_AGING_KINDS: readonly EntityName[] = [...GRN_KINDS, 'dispatch', 'dispatch_trl'];
/** GRN activity: receipts, lots, photos, invoices and the people named on them. */
export const GRN_ACTIVITY_KINDS: readonly EntityName[] = [
  ...GRN_KINDS, 'grn_images', 'invoice', 'dispatch', 'dispatch_trl', 'people', 'user_profiles',
];
/** Dispatch activity: dispatches, their lines and the lots they name. */
export const DISPATCH_ACTIVITY_KINDS: readonly EntityName[] = [...GRN_KINDS, 'dispatch', 'dispatch_trl'];
