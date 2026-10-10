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

  it.each(['A0010 ', ' A0010', 'A 0010', '     '])('rejects "%s": a number has no spaces', async (grNo) => {
    const result = await validateStep1(header({ gr_no: grNo }));
    expect(result.isValid).toBe(false);
    expect(result.errors.gr_no).toBeTruthy();
  });

  it('rejects a number longer than the eight characters the server stores', async () => {
    const result = await validateStep1(header({ gr_no: 'A00100000' }));
    expect(result.isValid).toBe(false);
    expect(result.errors.gr_no).toBeTruthy();
  });
});
