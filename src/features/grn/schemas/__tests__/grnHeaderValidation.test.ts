import { validateStep1 } from '../grnValidation';

const header = (overrides: Record<string, unknown> = {}) => ({
  gr_no: 'A0010',
  registration: '',
  date: '2026-10-01',
  sender_id: '',
  sender_name: 'Fictional Sender',
  customer_id: '33333333-2222-4333-8444-555555555555',
  customer_name: 'Fictional Traders',
  supervisor_id: '44444444-2222-4333-8444-555555555555',
  supervisor_name: 'Fictional Supervisor',
  note: '',
  leon: false,
  pricing_mode: 'MONTHLY',
  gr_images: [],
  ...overrides,
});

describe('GRN number rule', () => {
  it('accepts a normal number and an empty one (generated on save)', async () => {
    expect((await validateStep1(header())).isValid).toBe(true);
    expect((await validateStep1(header({ gr_no: '' }))).isValid).toBe(true);
  });

  it('rejects a number longer than the twenty characters the server stores', async () => {
    const result = await validateStep1(header({ gr_no: 'GRN/26-27/00000000001' }));
    expect(result.isValid).toBe(false);
    expect(result.errors.gr_no).toBe('GRN number must be at most 20 characters');
  });

  it.each(['A00100000', 'GRN/26-27/0042', '14/B/2027', 'GRN/26-27/000000001'])('accepts %s: the shape of a number is the facility rule, which the server checks', async (grNo) => {
    expect((await validateStep1(header({ gr_no: grNo }))).isValid).toBe(true);
  });
});

describe('GRN date limit', () => {
  afterEach(() => jest.useRealTimers());

  it('is today when the form is checked, not the day the app was started', async () => {
    // The app was started on 9 October and left open overnight.
    jest.useFakeTimers({ now: new Date(2026, 9, 9, 18, 0, 0) });
    let validate!: typeof validateStep1;
    jest.isolateModules(() => {
      validate = require('../grnValidation').validateStep1;
    });

    jest.setSystemTime(new Date(2026, 9, 10, 8, 30, 0));

    expect((await validate(header({ date: '2026-10-10' }))).isValid).toBe(true);
    // A date picked in the date picker is stored as an ISO time.
    expect((await validate(header({ date: new Date(2026, 9, 10).toISOString() }))).isValid).toBe(true);
  });

  it('still rejects tomorrow', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 10, 8, 30, 0) });

    const result = await validateStep1(header({ date: '2026-10-11' }));

    expect(result.isValid).toBe(false);
    expect(result.errors.date).toBeTruthy();
  });

  it('accepts any time today, also late in the evening', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 10, 8, 30, 0) });

    expect((await validateStep1(header({ date: new Date(2026, 9, 10, 23, 0, 0).toISOString() }))).isValid).toBe(true);
  });
});
