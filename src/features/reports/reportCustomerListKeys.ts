/**
 * The list key of each report's one-customer level, by report id (the route name under
 * /reports). Opening a customer's report clears that customer's search under this key
 * (`clearDestinationFilters` in ./useReportScope), so a search typed for an earlier visit
 * does not narrow the report that opens (review 2026-10-13, SR-06).
 *
 * Written out rather than read from the filter configurations, so the scope hook does not
 * load every report's configuration; a test checks that each entry equals its
 * configuration's `listKey`.
 */
export const REPORT_CUSTOMER_LIST_KEYS: Readonly<Record<string, string>> = {
  'grn-activity': 'report-grn-activity-customer',
  'dispatch-activity': 'report-dispatch-activity-customer',
  'invoice-history': 'report-invoice-history-customer',
  'stock-aging': 'report-stock-aging-customer',
  'stock-summary': 'report-stock-summary-customer',
  'customer-activity': 'report-customer-activity-customer',
  // One list key for every customer and for all of them; one customer's search is kept per customer.
  'item-stock-summary': 'report-item-stock',
};

/** The list key of `reportId`'s one-customer level, or undefined for a report without one. */
export const reportCustomerListKey = (reportId: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(REPORT_CUSTOMER_LIST_KEYS, reportId) ? REPORT_CUSTOMER_LIST_KEYS[reportId] : undefined;
