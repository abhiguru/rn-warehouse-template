/**
 * WH-253: the app never refuses an id the server gave it because of the id's shape. Any 8-4-4-4-12 hex id (any
 * version or variant, either case) passes the dispatch, GRN and invoice schemas and the route hook; something that is
 * not a UUID is still refused with the existing message, and an empty choice with the existing "required" text.
 * 2b273ab8-fc38-69cb-f981-21973070127f has version 6 and variant f: yup's `.uuid()` and a version-4 pattern both refuse it.
 */
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));

import { validateStep1 as dispatchStep1, validateSingleItem } from '@/features/dispatch/schemas/dispatchValidation';
import { validateStep1 as grnStep1, validateStep2 as grnStep2 } from '@/features/grn/schemas/grnValidation';
import { validateStep1 as invoiceStep1, validateStep2 as invoiceStep2 } from '@/features/invoice/schemas/invoiceValidation';
import { isValidUUID } from '@/hooks/useRouteParams';
import { t } from '@/i18n';

const ODD = '2b273ab8-fc38-69cb-f981-21973070127f';
const ODD_UPPER = ODD.toUpperCase();
const V4 = '22222222-0000-4000-8000-000000000001';
const BAD = ['not-a-uuid', '2b273ab8-fc38-69cb-f981-21973070127', '2b273ab8fc3869cbf98121973070127f', '2b273ab8-fc38-69cb-f981-21973070127g'];

const dispatchHeader = (over: Record<string, unknown> = {}) => ({
  disp_no: 'I0001', disp_date: '2026-01-01', registration: 'TEST 1234',
  customer_id: V4, customer_name: 'Disposable Customer', supervisor_id: V4, supervisor_name: 'Demo Admin', note: '', ...over,
});
const grnHeader = (over: Record<string, unknown> = {}) => ({
  gr_no: 'A0010', registration: '', date: '2026-10-01', sender_id: '', sender_name: 'Fictional Sender',
  customer_id: V4, customer_name: 'Fictional Traders', supervisor_id: V4, supervisor_name: 'Fictional Supervisor',
  note: '', leon: false, pricing_mode: 'MONTHLY', gr_images: [], ...over,
});
const invoiceHeader = (over: Record<string, unknown> = {}) => ({
  inv_date: '2026-10-10', inv_fin_year: '2026-27', inv_no: 12, gr_id: V4, gr_no: 'A0010',
  customer_id: V4, customer_name: 'Example Traders', one_time_charge: false, discount: 0, ...over,
});
const invoiceLine = (over: Record<string, unknown> = {}) => ({
  temp_id: 't1', disp_trl_id: V4, qty: 100, duration: 1, no_of_days: 30, charge: 5, labour_rate: 2, tax: 5, ...over,
});

describe.each([['version 6, variant f', ODD], ['upper case', ODD_UPPER]])('an id that is not version 4 (%s)', (_name, id) => {
  it('dispatch step 1 accepts it as customer and as supervisor', async () => {
    await expect(dispatchStep1(dispatchHeader({ customer_id: id, supervisor_id: id }))).resolves.toEqual({ isValid: true, errors: {} });
  });

  it('a dispatch line accepts it as GRN, lot and item', async () => {
    const { errors } = await validateSingleItem({ grns_id: id, grnItems_id: id, grnItems_item_id: id });
    expect(errors.grns_id).toBeUndefined();
    expect(errors.grnItems_id).toBeUndefined();
    expect(errors.grnItems_item_id).toBeUndefined();
  });

  it('GRN step 1 accepts it as customer and supervisor, step 2 as item', async () => {
    await expect(grnStep1(grnHeader({ customer_id: id, supervisor_id: id }))).resolves.toEqual({ isValid: true, errors: {} });
    const { errors } = await grnStep2({ items: [{ item_table_id: id, item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10, weight: 50 }] });
    expect(Object.keys(errors).join()).not.toMatch(/item_table_id/);
  });

  it('invoice step 1 accepts it as GRN and customer, step 2 as the dispatch line', async () => {
    await expect(invoiceStep1(invoiceHeader({ gr_id: id, customer_id: id }))).resolves.toEqual({ isValid: true, errors: {} });
    expect(await invoiceStep2([invoiceLine({ disp_trl_id: id })])).toEqual({ isValid: true, errors: {} });
  });

  it('the route hook accepts it', () => {
    expect(isValidUUID(id)).toBe(true);
  });
});

describe('something that is not a UUID is still refused with the existing message', () => {
  it.each(BAD)('dispatch %s', async (bad) => {
    const result = await dispatchStep1(dispatchHeader({ customer_id: bad, supervisor_id: bad }));
    expect(result.errors.customer_id).toBe(t('dispatch.validation.customerInvalid'));
    expect(result.errors.supervisor_id).toBe(t('dispatch.validation.supervisorInvalid'));
    const line = await validateSingleItem({ grns_id: bad, grnItems_id: bad, grnItems_item_id: bad });
    expect(line.errors.grns_id).toBe(t('dispatch.validation.grnInvalid'));
    expect(line.errors.grnItems_id).toBe(t('dispatch.validation.lotInvalid'));
    expect(line.errors.grnItems_item_id).toBe(t('dispatch.validation.itemInvalid'));
  });

  it.each(BAD)('GRN %s', async (bad) => {
    const result = await grnStep1(grnHeader({ customer_id: bad, supervisor_id: bad }));
    expect(result.errors.customer_id).toBe(t('grn.validation.customerInvalid'));
    expect(result.errors.supervisor_id).toBe(t('grn.validation.supervisorInvalid'));
    const lines = await grnStep2({ items: [{ item_table_id: bad, item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10, weight: 50 }] });
    expect(Object.entries(lines.errors).find(([k]) => /item_table_id/.test(k))?.[1]).toBe(t('grn.validation.itemInvalid'));
  });

  it.each(BAD)('invoice %s', async (bad) => {
    const result = await invoiceStep1(invoiceHeader({ gr_id: bad, customer_id: bad }));
    expect(result.errors.gr_id).toBe(t('invoice.validation.grnInvalid'));
    expect(result.errors.customer_id).toBe(t('invoice.validation.customerInvalid'));
    const lines = await invoiceStep2([invoiceLine({ disp_trl_id: bad })]);
    expect(lines.isValid).toBe(false);
    expect(Object.keys(lines.errors).join()).toMatch(/disp_trl_id/);
  });

  it.each(BAD)('the route hook refuses %s', (bad) => {
    expect(isValidUUID(bad)).toBe(false);
  });

  it('the route hook refuses a non-string', () => {
    expect(isValidUUID(undefined)).toBe(false);
    expect(isValidUUID(42)).toBe(false);
  });
});

describe('a missing choice is still "required"', () => {
  it('dispatch customer', async () => {
    const result = await dispatchStep1(dispatchHeader({ customer_id: '' }));
    expect(result.errors.customer_id).toBe(t('dispatch.validation.customerRequired'));
  });
  it('GRN customer', async () => {
    const result = await grnStep1(grnHeader({ customer_id: '' }));
    expect(result.errors.customer_id).toBe(t('grn.validation.customerRequired'));
  });
  it('invoice GRN', async () => {
    const result = await invoiceStep1(invoiceHeader({ gr_id: '' }));
    expect(result.errors.gr_id).toBe(t('invoice.validation.grnRequired'));
  });
});
