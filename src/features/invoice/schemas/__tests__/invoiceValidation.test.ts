import { validateStep1 } from '../invoiceValidation';

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
