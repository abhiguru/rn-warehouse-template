/**
 * A rack is free text (owner decision of 2026-10-11): every facility writes
 * its racks its own way, and racks recorded before the app had a format rule
 * ("C3", "20B") must not keep a GRN from being saved again. Only the length is
 * checked, because the server column holds 30 characters.
 */
import { en } from '@/i18n/locales/en';
import { gu } from '@/i18n/locales/gu';
import { itemSchema, validateStep2, validateStep3 } from '../grnValidation';

const ITEM_ID = '66666666-2222-4333-8444-555555555555';
const line = (rack: string) => ({
  grn_trl_id: 'line-1',
  item_table_id: ITEM_ID,
  item_name: 'Example Potatoes',
  packaging: 'Bag',
  qty: 10,
  stock: 10,
  weight: 50,
  rack,
  package_mark: '',
});

const header = {
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
};

const RACKS = [
  'C3',
  '20B',
  '20B-20C',
  'A/1/2',
  'F1/C4',
  '20B/F1/C4',
  'Row 3, upper',
  '/C4',
  'F1/',
  'ચેમ્બર ૩',
  'ભોંયતળિયું/ચેમ્બર ૧',
  '',
];

describe('item schema rack', () => {
  it.each(RACKS)('accepts %p unchanged', async (rack) => {
    await expect(itemSchema.validateAt('rack', line(rack))).resolves.toBe(rack);
  });

  it('accepts a line that has no rack at all', async () => {
    const { rack: _rack, ...withoutRack } = line('');
    expect((await validateStep2({ items: [withoutRack] })).isValid).toBe(true);
  });

  it('accepts 30 characters and refuses 31, which the server column cannot hold', async () => {
    await expect(itemSchema.validateAt('rack', line('A'.repeat(30)))).resolves.toBe('A'.repeat(30));
    const error = await itemSchema.validateAt('rack', line('A'.repeat(31))).catch((caught) => caught);
    expect(error.message).toBe('Rack must be at most 30 characters');
  });
});

describe('a GRN whose lines carry free-text racks', () => {
  it.each(RACKS)('passes the items step with rack %p', async (rack) => {
    expect(await validateStep2({ items: [line(rack)] })).toEqual({ isValid: true, errors: {} });
  });

  it('is not held back on review by a line stored with "C3" before the edit', async () => {
    const items = [line('C3'), { ...line('20B'), grn_trl_id: 'line-2' }];
    expect(await validateStep3({ header, items })).toEqual({ isValid: true, errors: {} });
  });
});

describe('the old format rule', () => {
  it('has no message left in either language', () => {
    expect(en.grn.validation).not.toHaveProperty('rackFormat');
    expect(gu.grn.validation).not.toHaveProperty('rackFormat');
    expect(JSON.stringify(en.grn)).not.toMatch(/Floor\/Chamber/);
  });
});
