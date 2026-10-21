/**
 * The server's POSSIBLE_DUPLICATE warning (backend migration 124), read and worded by the app: "Possible duplicate" with
 * [Cancel | Save anyway], in English and Gujarati, with and without the person who made the earlier record.
 */
import { setLanguage } from '@/i18n';
import { askAlert, whenAlertsClosed } from '@/utils/alert';
import { REFUSAL } from '@/utils/serverRefusal';
import { agoText, askPossibleDuplicate, duplicateMessage, itemsText, possibleDuplicateOf, type PossibleDuplicate } from '../possibleDuplicate';

jest.mock('@/utils/alert', () => ({ askAlert: jest.fn(), whenAlertsClosed: jest.fn(async () => undefined) }));

const NOW = Date.parse('2026-10-21T10:30:00Z');
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();

const grnBody = {
  success: false,
  error_code: 'WH409',
  reason: 'POSSIBLE_DUPLICATE',
  error: 'GRN Z0010 for Hilltop Fresh Mart was created 3 minutes ago with the same items.',
  message: 'GRN Z0010 for Hilltop Fresh Mart was created 3 minutes ago with the same items.',
  kind: 'grn',
  existing_id: '11111111-2222-4333-8444-555555555555',
  existing_number: 'Z0010',
  existing_created_at: minutesAgo(3),
  existing_created_by: 'Ravi Example',
  customer_name: 'Hilltop Fresh Mart',
  items: [{ item_name: 'Potatoes', packaging: 'Jute bag' }, { item_name: 'Onions', packaging: null }],
  window_minutes: 30,
};
const dispatchBody = {
  ...grnBody,
  error: 'Dispatch D0042 ...',
  message: 'Dispatch D0042 ...',
  kind: 'dispatch',
  existing_number: 'D0042',
  customer_name: 'Green Valley Traders',
  items: [{ gr_no: 'A0010', item_name: 'Potatoes', packaging: 'Jute bag' }],
  vehicle: 'GJ01AB1234',
};

afterEach(() => setLanguage('en'));

describe('reading the answer', () => {
  it('reads the earlier GRN from the body the server sends', () => {
    expect(possibleDuplicateOf(grnBody, 'grn')).toEqual({
      kind: 'grn',
      existingId: '11111111-2222-4333-8444-555555555555',
      existingNumber: 'Z0010',
      createdAt: minutesAgo(3),
      createdBy: 'Ravi Example',
      customerName: 'Hilltop Fresh Mart',
      items: [{ itemName: 'Potatoes', packaging: 'Jute bag', grNo: undefined }, { itemName: 'Onions', packaging: undefined, grNo: undefined }],
      vehicle: undefined,
      windowMinutes: 30,
    });
  });

  it('reads the earlier dispatch with its GRN numbers and vehicle', () => {
    expect(possibleDuplicateOf(dispatchBody, 'dispatch')).toMatchObject({
      kind: 'dispatch',
      existingNumber: 'D0042',
      items: [{ grNo: 'A0010', itemName: 'Potatoes', packaging: 'Jute bag' }],
      vehicle: 'GJ01AB1234',
    });
  });

  it('reads a service result that carries the refusal, and an RPCResult that sorted it into fields', () => {
    const { success: _s, error_code: _c, reason, error: _e, message: _m, ...fields } = grnBody;
    // The dispatch form's result: its own `reason` next to the refusal sorted into reason and fields.
    expect(possibleDuplicateOf({ success: false, reason, refusal: { reason, fields }, error: 'x', message: 'x' }, 'dispatch')).toMatchObject({
      existingNumber: 'Z0010',
      customerName: 'Hilltop Fresh Mart',
      items: [{ itemName: 'Potatoes' }, { itemName: 'Onions' }],
    });
    expect(possibleDuplicateOf({ success: false, reason, fields, serverMessage: 'x' }, 'grn')?.existingNumber).toBe('Z0010');
  });

  it('takes the kind from the caller when the server names none, and the window from the default', () => {
    const { kind: _kind, window_minutes: _window, ...bare } = grnBody;
    expect(possibleDuplicateOf(bare, 'grn')).toMatchObject({ kind: 'grn', windowMinutes: 30 });
    expect(possibleDuplicateOf(bare, 'dispatch')).toMatchObject({ kind: 'dispatch' });
  });

  it('ignores a person that is blank, and an item without a name', () => {
    const result = possibleDuplicateOf({ ...grnBody, existing_created_by: '  ', items: [{ item_name: '' }, { item_name: 'Garlic' }, 'text'] }, 'grn');
    expect(result?.createdBy).toBeUndefined();
    expect(result?.items.map((item) => item.itemName)).toEqual(['Garlic']);
  });

  it.each([
    ['another refusal', { success: false, reason: REFUSAL.ORDER_CHANGED, error_code: 'WH409' }],
    ['a success', { success: true }],
    ['nothing', null],
    ['text', 'POSSIBLE_DUPLICATE'],
  ])('is none for %s', (_name, answer) => {
    expect(possibleDuplicateOf(answer, 'grn')).toBeUndefined();
  });
});

describe('how long ago', () => {
  it.each([
    [0, 'just now'],
    [0.5, 'just now'],
    [1, '1 minute ago'],
    [1.9, '1 minute ago'],
    [2, '2 minutes ago'],
    [29, '29 minutes ago'],
  ])('%s minutes reads "%s"', (minutes, text) => {
    expect(agoText(new Date(NOW - minutes * 60_000).toISOString(), NOW)).toBe(text);
  });

  it('never says more than the window the server looked back over', () => {
    expect(agoText(minutesAgo(75), NOW, 30)).toBe('30 minutes ago');
    expect(agoText(minutesAgo(30), NOW, 30)).toBe('30 minutes ago');
    expect(agoText(minutesAgo(31), NOW, 30)).toBe('30 minutes ago');
    expect(agoText(minutesAgo(12), NOW, 30)).toBe('12 minutes ago');
    // The window of the answer is used by the question.
    const grn = possibleDuplicateOf({ ...grnBody, existing_created_at: minutesAgo(75) }, 'grn') as PossibleDuplicate;
    expect(duplicateMessage(grn, NOW)).toContain('was created 30 minutes ago by');
    const short = possibleDuplicateOf({ ...grnBody, existing_created_at: minutesAgo(75), window_minutes: 10 }, 'grn') as PossibleDuplicate;
    expect(duplicateMessage(short, NOW)).toContain('was created 10 minutes ago by');
  });

  it('reads "just now" for a negative age (a record dated after this phone\'s clock)', () => {
    expect(agoText(minutesAgo(-5), NOW, 30)).toBe('just now');
    expect(agoText(minutesAgo(-0.5), NOW, 30)).toBe('just now');
  });

  it('reads "just now" for a time that is missing, unreadable, or ahead of this phone\'s clock', () => {
    expect(agoText(undefined, NOW)).toBe('just now');
    expect(agoText('not a date', NOW)).toBe('just now');
    expect(agoText(new Date(NOW + 5 * 60_000).toISOString(), NOW)).toBe('just now');
  });

  it('says it in Gujarati digits', () => {
    setLanguage('gu');
    expect(agoText(minutesAgo(12), NOW)).toBe('૧૨ મિનિટ પહેલાં');
    expect(agoText(minutesAgo(0), NOW)).toBe('હમણાં જ');
  });
});

describe('the lines named in the question', () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ itemName: `Item ${i + 1}`, packaging: 'Bag' }));

  it('names an item with its packing, and a lot with its GRN number', () => {
    expect(itemsText([{ itemName: 'Potatoes', packaging: 'Jute bag' }, { itemName: 'Onions' }])).toBe('Potatoes · Jute bag, Onions');
    expect(itemsText([{ grNo: 'A0010', itemName: 'Potatoes', packaging: 'Jute bag' }])).toBe('A0010 · Potatoes · Jute bag');
  });

  it('names the first four and counts the rest', () => {
    expect(itemsText(lines(4))).toBe('Item 1 · Bag, Item 2 · Bag, Item 3 · Bag, Item 4 · Bag');
    expect(itemsText(lines(7))).toBe('Item 1 · Bag, Item 2 · Bag, Item 3 · Bag, Item 4 · Bag, +3 more');
  });
});

describe('the question', () => {
  const grn = possibleDuplicateOf(grnBody, 'grn') as PossibleDuplicate;
  const dispatch = possibleDuplicateOf(dispatchBody, 'dispatch') as PossibleDuplicate;

  it('GRN, with the person', () => {
    expect(duplicateMessage(grn, NOW)).toBe(
      'GRN Z0010 for Hilltop Fresh Mart was created 3 minutes ago by Ravi Example with the same items (Potatoes · Jute bag, Onions). Save this as a new GRN anyway?'
    );
  });

  it('GRN, without the person: " by {person}" is dropped', () => {
    expect(duplicateMessage({ ...grn, createdBy: undefined, createdAt: minutesAgo(0) }, NOW)).toBe(
      'GRN Z0010 for Hilltop Fresh Mart was created just now with the same items (Potatoes · Jute bag, Onions). Save this as a new GRN anyway?'
    );
  });

  it('dispatch, with the person: lots and vehicle', () => {
    expect(duplicateMessage({ ...dispatch, createdAt: minutesAgo(1) }, NOW)).toBe(
      'Dispatch D0042 for Green Valley Traders was created 1 minute ago by Ravi Example with the same lots (A0010 · Potatoes · Jute bag) and vehicle GJ01AB1234. Save this as a new dispatch anyway?'
    );
  });

  it('dispatch, without the person', () => {
    expect(duplicateMessage({ ...dispatch, createdBy: undefined }, NOW)).toBe(
      'Dispatch D0042 for Green Valley Traders was created 3 minutes ago with the same lots (A0010 · Potatoes · Jute bag) and vehicle GJ01AB1234. Save this as a new dispatch anyway?'
    );
  });

  it('is the app\'s own sentence in Gujarati, with typed names and identifiers as typed', () => {
    setLanguage('gu');
    const message = duplicateMessage(grn, NOW);
    expect(message).toContain('Hilltop Fresh Mart');
    expect(message).toContain('Z0010');
    expect(message).toContain('Ravi Example');
    expect(message).toContain('૩ મિનિટ પહેલાં');
    expect(message).not.toMatch(/created|anyway/);
  });

  it('is asked with Cancel and Save anyway, and answers cancel when the dialog is closed', async () => {
    jest.mocked(askAlert).mockResolvedValue('save');

    await expect(askPossibleDuplicate(grn)).resolves.toBe('save');

    const [title, , choices, dismissed] = jest.mocked(askAlert).mock.calls[0];
    expect(title).toBe('Possible duplicate');
    expect(choices.map((choice) => [choice.text, choice.value, choice.style])).toEqual([
      ['Cancel', 'cancel', 'cancel'],
      ['Save anyway', 'save', undefined],
    ]);
    expect(dismissed).toBe('cancel');
  });

  it('Save anyway is answered only after the dialog has finished closing; Cancel needs no wait', async () => {
    let closed!: () => void;
    jest.mocked(whenAlertsClosed).mockReturnValueOnce(new Promise<void>((resolve) => { closed = resolve; }));
    jest.mocked(askAlert).mockResolvedValueOnce('save');
    let answered = false;

    const asking = askPossibleDuplicate(grn).then((choice) => { answered = true; return choice; });
    await Promise.resolve();
    await Promise.resolve();
    expect(answered).toBe(false);

    closed();
    await expect(asking).resolves.toBe('save');

    jest.mocked(whenAlertsClosed).mockClear();
    jest.mocked(askAlert).mockResolvedValueOnce('cancel');
    await expect(askPossibleDuplicate(grn)).resolves.toBe('cancel');
    expect(whenAlertsClosed).not.toHaveBeenCalled();
  });
});
