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

  // A total of 0 is for an invoice on which nothing is charged. A discount that
  // takes a charged invoice down to 0 is refused, with or without a free line on it.
  it('refuses a total of 0 that a discount produced, also when one of the lines is free', async () => {
    const free = line({ labour_rate: 0, tax: 0 });
    const charged = line({ temp_id: 't2', charge: 5, labour_rate: 0, tax: 0 });
    const discounted = { ...totals(0), discount: 500 };

    expect(await validateFullInvoice({ header: discounted, items: [free, charged] }))
      .toEqual({ isValid: false, errors: { 'header.total': 'Total must be positive' } });
    // The same invoice without the free line was refused all along.
    expect(await validateFullInvoice({ header: discounted, items: [charged] }))
      .toEqual({ isValid: false, errors: { 'header.total': 'Total must be positive' } });
  });

  it('refuses a total of 0 that a discount rounded up to (-0.5 is saved as 0)', async () => {
    const result = await validateFullInvoice({
      header: { ...totals(Math.ceil(-0.5)), discount: 500.5 },
      items: [line({ labour_rate: 0, tax: 0 }), line({ temp_id: 't2', charge: 5, labour_rate: 0, tax: 0 })],
    });

    expect(result.errors['header.total']).toBe('Total must be positive');
  });

  it('refuses a total of 0 when a line is charged, whatever the discount says', async () => {
    const result = await validateFullInvoice({
      header: totals(0),
      items: [line({ labour_rate: 0, tax: 0 }), line({ temp_id: 't2', charge: 5, labour_rate: 0, tax: 0 })],
    });

    expect(result.errors['header.total']).toBe('Total must be positive');
  });

  it('judges "nothing is charged" after rounding each charge to two decimals, as the server does', async () => {
    const almostFree = line({ charge: 0.004, labour_rate: 0, tax: 0 });
    expect(await validateFullInvoice({ header: totals(0), items: [almostFree] })).toEqual({ isValid: true, errors: {} });

    const onePaisa = line({ charge: 0.005, labour_rate: 0, tax: 0 });
    expect((await validateFullInvoice({ header: totals(0), items: [onePaisa] })).errors['header.total']).toBe('Total must be positive');
  });

  it('accepts a free line with a surcharge: the total is above 0', async () => {
    const result = await validateFullInvoice({ header: { ...totals(50), discount: -50 }, items: [line({ labour_rate: 0, tax: 0 })] });

    expect(result).toEqual({ isValid: true, errors: {} });
  });

  it('never accepts a total below 0', async () => {
    const result = await validateFullInvoice({ header: totals(-10), items: [line()] });

    expect(result.errors['header.total']).toBe('Total must be positive');
  });
});

// The per-field fast path (linesPassPerField) only decides that a list is valid; whatever it does not prove valid runs
// the full check, so errors, paths and messages are what they always were.
describe('the lines check with many lines (each distinct value is checked once)', () => {
  const line = (n: number, overrides: Record<string, unknown> = {}) => ({
    temp_id: `t${n}`,
    disp_trl_id: `aaaaaaaa-2222-4333-8444-${String(n).padStart(12, '0')}`,
    qty: 100,
    duration: 1,
    no_of_days: 30,
    charge: 5,
    labour_rate: 2,
    tax: 5,
    ...overrides,
  });
  const many = (count: number, at?: [number, Record<string, unknown>]) =>
    Array.from({ length: count }, (_, n) => line(n, at && at[0] === n ? at[1] : {}));
  const totals = { ...header(), labour: 0, tax_amount: 0, total: 100 };

  it('passes a long valid list at the items step and at Save', async () => {
    expect(await validateStep2(many(500))).toEqual({ isValid: true, errors: {} });
    expect(await validateFullInvoice({ header: totals, items: many(500) })).toEqual({ isValid: true, errors: {} });
  });

  it('reports one wrong line among many with its own path and message, as the full check does', async () => {
    const result = await validateStep2(many(500, [317, { charge: -1 }]));

    expect(result.isValid).toBe(false);
    expect(Object.keys(result.errors)).toEqual(['items[317].charge']);
    expect(result.errors['items[317].charge']).toBe('Charge cannot be negative');
  });

  it('reports every wrong line, also those with the same wrong value', async () => {
    const items = many(50).map((entry, n) => (n % 10 === 0 ? { ...entry, duration: 0 } : entry));
    const result = await validateStep2(items);

    expect(Object.keys(result.errors).sort()).toEqual(['items[0].duration', 'items[10].duration', 'items[20].duration', 'items[30].duration', 'items[40].duration']);
  });

  it('refuses a wrong value that is the only one of its field, at Save too', async () => {
    const result = await validateFullInvoice({ header: totals, items: many(200, [199, { duration: 0 }]) });

    expect(result.isValid).toBe(false);
    expect(Object.keys(result.errors)).toEqual(['items[199].duration']);
  });

  it.each([
    ['an empty list', []],
    ['no list', undefined],
    ['null', null],
    ['an object', { 0: line(0) }],
  ])('does not prove %s valid: the full check answers', async (_name, items) => {
    const result = await validateStep2(items);

    expect(result.isValid).toBe(false);
    expect(Object.keys(result.errors).length).toBeGreaterThan(0);
  });

  it('does not take a line that is not a plain object for valid', async () => {
    expect((await validateStep2([line(0), null])).isValid).toBe(false);
    expect((await validateStep2([line(0), 'a line'])).isValid).toBe(false);
    expect((await validateStep2([line(0), [line(1)]])).isValid).toBe(false);
  });

  it('does not take an object where a figure belongs for valid', async () => {
    expect((await validateStep2([line(0, { charge: { value: 5 } })])).isValid).toBe(false);
  });

  it('at Save, a charge that is not a number goes through the full check, which decides', async () => {
    const result = await validateFullInvoice({ header: totals, items: [line(0, { charge: '5' })] });

    // yup reads "5" as the number 5: the answer is the full check's, whatever it is, and not an unchecked pass of the fast path.
    const full = await validateFullInvoice({ header: totals, items: [line(0, { charge: 5 })] });
    expect(result.isValid).toBe(full.isValid);
  });

  it('keeps the header rules: a wrong header is refused with many good lines', async () => {
    const result = await validateFullInvoice({ header: { ...totals, total: 0 }, items: many(300) });

    expect(result.errors['header.total']).toBe('Total must be positive');
  });
});
