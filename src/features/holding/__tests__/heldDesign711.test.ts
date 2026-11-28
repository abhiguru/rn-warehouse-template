/**
 * WH-304 Design findings (offline-capture.md 7.3, 7.5, 7.11f): the phone's name of a held row, the lines of a held new GRN,
 * and the duplicate sentence and hint with and without the other GRN. Real: the modules and i18n; nothing is faked.
 */
import { setLanguage } from '@/i18n';
import { phoneNameOf, listRowOf } from '@/features/holding/holdingApi';
import { newGrnLines, removedLinesNow } from '@/features/holding/heldEditLines';
import { describeReason } from '@/features/holding/heldReason';

afterEach(async () => {
  await setLanguage('en');
});

describe('phoneNameOf (7.11f): never a user-agent text', () => {
  it('takes the server\'s device_name', () => {
    expect(phoneNameOf({ device_name: 'Fictional Android phone', phone: 'okhttp/4.9.2' })).toBe('Fictional Android phone');
  });

  it('takes a plain name in phone', () => {
    expect(phoneNameOf({ phone: 'Fictional Android phone' })).toBe('Fictional Android phone');
  });

  it.each(['okhttp/4.9.2', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36', 'Dalvik/2.1.0 (Linux; U; Android 14)', 'CFNetwork/1494.0.7 Darwin/23.4.0'])(
    'leaves out the user agent %s',
    agent => {
      expect(phoneNameOf({ phone: agent })).toBeNull();
    }
  );

  it('nothing at all, or empty strings, gives no name', () => {
    expect(phoneNameOf({})).toBeNull();
    expect(phoneNameOf({ device_name: '', phone: '' })).toBeNull();
  });

  it('a list row with a user agent has no phone, so the footnote reads "name · time"', () => {
    const row = listRowOf({ id: 'h1', kind: 'newGrn', recorded_by_name: 'Ravi Fictional', recorded_at: '2026-11-27T09:00:00+05:30', phone: 'okhttp/4.9.2' });
    expect(row?.phone).toBeNull();
  });
});

describe('newGrnLines (7.3 item 3): the lines of a held new GRN, from body.args.p_items', () => {
  const body = (items: unknown) => ({ args: { p_items: items } });

  it('a line with mark and rack reads "item, mark, quantity, Rack X"', () => {
    expect(newGrnLines(body([{ item_name: 'Apple', package_mark: 'ZZ-1', qty: 12, packaging: 'bag', rack: 'D-4' }]))).toEqual(['Apple, ZZ-1, 12 Bag, Rack D-4']);
  });

  it('a line without mark and rack has neither, and no stray comma', () => {
    expect(newGrnLines(body([{ item_name: 'Apple', qty: 1, packaging: 'bag' }]))).toEqual(['Apple, 1 Bag']);
    expect(newGrnLines(body([{ item_name: 'Apple', qty: 1, packaging: 'bag', package_mark: '', rack: '' }]))).toEqual(['Apple, 1 Bag']);
  });

  it('one row per line, in order', () => {
    const rows = newGrnLines(body([{ item_name: 'Apple', qty: 1, packaging: 'bag' }, { item_name: 'Beans', qty: 2, packaging: 'bag', rack: 'A-1' }]));
    expect(rows).toEqual(['Apple, 1 Bag', 'Beans, 2 Bag, Rack A-1']);
  });

  it.each([
    ['no body', undefined],
    ['body is null', null],
    ['body is a string', 'x'],
    ['no args', {}],
    ['args is a string', { args: 'x' }],
    ['p_items missing', { args: {} }],
    ['p_items is not an array', { args: { p_items: { item_name: 'Apple' } } }],
    ['p_items is a string', { args: { p_items: 'Apple' } }],
  ])('malformed: %s gives no lines and does not throw', (_name, bad) => {
    expect(newGrnLines(bad)).toEqual([]);
  });

  it('malformed entries: non-objects and lines with no item name are skipped, odd fields do not throw', () => {
    const rows = newGrnLines(
      body([null, 7, 'x', [], { qty: 3 }, { item_name: 7 }, { item_name: 'Apple', qty: 'many', packaging: 5, package_mark: {}, rack: [] }, { item_name: 'Beans', qty: null }])
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^Apple/);
    expect(rows[1]).toMatch(/^Beans/);
  });

  it('a malformed show.lines does not throw and the body\'s own item name is used', () => {
    expect(() => newGrnLines({ args: { p_items: [{ item_name: 'Apple', qty: 1, packaging: 'bag' }] }, show: { lines: 'x' } })).not.toThrow();
    expect(newGrnLines({ args: { p_items: [{ item_name: 'Apple', qty: 1, packaging: 'bag' }] }, show: { lines: [5] } })).toEqual(['Apple, 1 Bag']);
  });
});

describe('the duplicate sentence and hint (7.5, 7.11f)', () => {
  const words = (data: unknown) => describeReason('duplicate', { kind: 'newGrn', what: null, customer: 'asha Traders', data, followsWhat: null });
  const NO_REF_SENTENCE = 'A GRN for the same customer, item and quantity already exists.';
  const NO_REF_HINT = 'Look for it in the GRN list to compare; Accept if both are real, or reject.';

  it('English, with existing_number and existing_created_at: names the other GRN and the day', () => {
    const shown = words({ existing_number: 'A-3', existing_created_at: '2026-11-27T03:20:00+00:00' });
    expect(shown.sentence).toBe('GRN A-3 for the same customer, item and quantity was saved on 27/11/26.');
    expect(shown.hint).toBe('Open GRN A-3 to compare; Accept if both are real, or reject.');
  });

  it.each([
    ['no number', { existing_created_at: '2026-11-27T03:20:00+00:00' }],
    ['no date', { existing_number: 'A-3' }],
    ['neither', {}],
    ['empty strings', { existing_number: '', existing_created_at: '' }],
    ['no data at all', null],
  ])('English, %s: the no-reference words', (_name, data) => {
    const shown = words(data);
    expect(shown.sentence).toBe(NO_REF_SENTENCE);
    expect(shown.hint).toBe(NO_REF_HINT);
  });

  it('Gujarati, with both: Gujarati digits in the date, the number keeps 0-9', async () => {
    await setLanguage('gu');
    const shown = words({ existing_number: 'A-3', existing_created_at: '2026-11-27T03:20:00+00:00' });
    expect(shown.sentence).toBe('૨૭/૧૧/૨૬ એ એ જ વેપારી, આઇટમ અને જથ્થા માટે આવક પાવતી A-3 સાચવાઈ છે.');
    expect(shown.hint).toBe('સરખાવવા આવક પાવતી A-3 ખોલો; બંને સાચી હોય તો સ્વીકારો, નહીંતર નકારો.');
  });

  it.each([
    ['no number', { existing_created_at: '2026-11-27T03:20:00+00:00' }],
    ['no date', { existing_number: 'A-3' }],
  ])('Gujarati, %s: the no-reference words from 7.11f', async (_name, data) => {
    await setLanguage('gu');
    const shown = words(data);
    expect(shown.sentence).toBe('આ જ વેપારી, આઇટમ અને નંગની આવક પાવતી પહેલેથી છે.');
    expect(shown.hint).toBe('સરખાવવા તેને આવક પાવતીની યાદીમાં શોધો; બંને સાચી હોય તો સ્વીકારો, નહીં તો નકારો.');
  });
});

describe('WH-412 (Design\'s code read): a removed line whose server line has no quantity', () => {
  const removed = { linesRemoved: [{ lotId: 'l1', item_name: 'Apple', qty: 40 }] };
  const server = (qty: unknown) => [{ id: 'l1', item_name: 'Apple', qty: qty as number, packaging: 'bag', package_mark: null }];

  it.each([
    ['null', null],
    ['absent', undefined],
    ['not a number', 'many'],
  ])('a quantity that is %s shows no figure: never "null", "undefined", "NaN" or a 0', (_what, qty) => {
    const rows = removedLinesNow(removed, server(qty));
    expect(rows).toHaveLength(1);
    expect(rows[0].text.trimEnd()).toBe('Now on the server: Apple');
    expect(rows[0].text).not.toMatch(/null|undefined|NaN|\d/);
  });

  it('a server quantity that is there is shown, a real 0 included', () => {
    expect(removedLinesNow(removed, server(12)).map(row => row.text)).toEqual(['Now on the server: Apple 12 Bag']);
    expect(removedLinesNow(removed, server(0)).map(row => row.text)).toEqual(['Now on the server: Apple 0 Bag']);
  });
});
