import { validateFullInvoice, validateItemPricing, validateStep1, validateStep2 } from '../invoiceValidation';

const header = (overrides: Record<string, unknown> = {}) => ({
  inv_date: '2026-10-10',
  inv_fin_year: '2026-27',
  inv_no: 12,
  gr_id: '11111111-2222-4333-8444-555555555555',
  gr_no: 'A0010',
  customer_id: '22222222-3333-4444-8555-666666666666',
  customer_name: 'Example Traders',
  one_time_charge: false,
  discount: 0,
  ...overrides,
});

describe('invoice date limit', () => {
  afterEach(() => jest.useRealTimers());

  it('is today when the form is checked, not the day the app was started', async () => {
    // The app was started on 9 October and left open overnight.
    jest.useFakeTimers({ now: new Date(2026, 9, 9, 18, 0, 0) });
    let validate!: typeof validateStep1;
    jest.isolateModules(() => {
      validate = require('../invoiceValidation').validateStep1;
    });

    jest.setSystemTime(new Date(2026, 9, 10, 8, 30, 0));

    const result = await validate(header({ inv_date: '2026-10-10' }));
    expect(result.errors.inv_date).toBeUndefined();
    expect(result.isValid).toBe(true);
  });

  it('still rejects tomorrow', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 10, 8, 30, 0) });

    const result = await validateStep1(header({ inv_date: '2026-10-11' }));

    expect(result.isValid).toBe(false);
    expect(result.errors.inv_date).toBeTruthy();
  });
});

// Owner decision 3 of 2026-10-11: a line may have a charge of 0 (its reason is
// asked for on the review step); a duration of 0 is still refused.
describe('a line with a charge of 0', () => {
  const line = (overrides: Record<string, unknown> = {}) => ({
    temp_id: 't1',
    disp_trl_id: 'aaaaaaaa-2222-4333-8444-555555555555',
    qty: 100,
    duration: 1,
    no_of_days: 30,
    charge: 0,
    labour_rate: 2,
    tax: 5,
    ...overrides,
  });
  const totals = (total: number) => ({ ...header(), labour: 0, tax_amount: 0, total });

  it('passes the items step', async () => {
    expect(await validateStep2([line(), line({ temp_id: 't2', charge: 5.5 })])).toEqual({ isValid: true, errors: {} });
    expect((await validateItemPricing(line())).isValid).toBe(true);
  });

  it('still needs a duration: 0 is refused, and the message speaks of the duration', async () => {
    const result = await validateStep2([line({ duration: 0 })]);

    expect(result.isValid).toBe(false);
    expect(Object.keys(result.errors)).toEqual(['items[0].duration']);
    expect(result.errors['items[0].duration']).toMatch(/Duration/);
  });

  it('is still refused below 0', async () => {
    const result = await validateStep2([line({ charge: -1 })]);

    expect(result.errors['items[0].charge']).toBe('Charge cannot be negative');
  });

  it('lets an invoice be saved whose total comes to 0 because nothing is charged', async () => {
    const result = await validateFullInvoice({ header: totals(0), items: [line({ labour_rate: 0, tax: 0 })] });

    expect(result).toEqual({ isValid: true, errors: {} });
  });

  it('lets an invoice with a free line and other charges be saved as before', async () => {
    const result = await validateFullInvoice({ header: { ...totals(210), labour: 200, tax_amount: 10 }, items: [line()] });

    expect(result.isValid).toBe(true);
  });

  it('keeps the rule for every other invoice: a total of 0 is refused', async () => {
    const result = await validateFullInvoice({ header: totals(0), items: [line({ charge: 5 })] });

    expect(result).toEqual({ isValid: false, errors: { 'header.total': 'Total must be positive' } });
  });

  it('never accepts a total below 0', async () => {
    const result = await validateFullInvoice({ header: totals(-10), items: [line()] });

    expect(result.errors['header.total']).toBe('Total must be positive');
  });
});
