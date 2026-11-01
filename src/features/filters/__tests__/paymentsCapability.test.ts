/**
 * The Payment choice of the invoice history belongs to facilities that record payments (capability `payments`):
 * without it the field is not offered, not a fast filter, and a choice stored earlier is dropped, not sent.
 */
import { INVOICE_HISTORY_CUSTOMER } from '../configs/reports/invoiceHistory';
import { normalizeValues, visibleFields } from '../filterModel';
import type { FilterContext } from '../types';

const ctx = (payments?: boolean): FilterContext => ({ role: 'staff', isWarehouseRole: true, assignedCustomers: [], ...(payments === undefined ? {} : { payments }) });

describe('the Payment field of the invoice history', () => {
  it('is offered when the facility records payments', () => {
    expect(visibleFields(INVOICE_HISTORY_CUSTOMER, ctx(true)).map(field => field.key)).toContain('payment');
    expect(normalizeValues(INVOICE_HISTORY_CUSTOMER, { payment: 'paid' }, ctx(true))).toEqual({ payment: 'paid' });
  });

  it.each([[false], [undefined]])('is not offered, and a stored choice is dropped, when payments is %s', payments => {
    expect(visibleFields(INVOICE_HISTORY_CUSTOMER, ctx(payments)).map(field => field.key)).not.toContain('payment');
    expect(normalizeValues(INVOICE_HISTORY_CUSTOMER, { payment: 'pending' }, ctx(payments))).toEqual({});
  });
});
