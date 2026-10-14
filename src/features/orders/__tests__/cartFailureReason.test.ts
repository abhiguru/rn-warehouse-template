/**
 * The reason on a lot the server refused (phone review 2026-10-14, OI-01): each
 * sentence of the cart functions (backend migration 28) in the app's words, in
 * both languages, and never database text or a stored status value.
 *
 * The answers are written as `OrderService` hands them back: a refusal sent as
 * the answer has the server's sentence in `message`; a raised exception has the
 * app's own text in `message` and the raw text in `error`.
 */
import { cartFailureReason, isAlreadyRemoved } from '../cartFailureReason';
import { setLanguage } from '@/i18n';

afterEach(() => setLanguage('en'));

const refused = (message: string, error: unknown = 'API_ERROR') => ({ success: false, message, error });
const raised = (text: string) => ({ success: false, message: "Couldn't add the item.", error: text });

const NOT_SAVED = { en: 'Not saved. Check your connection and try again.', gu: 'સચવાયું નથી. તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.' };
const ORDER_CLOSED = { en: 'This order is closed. Go back and open it again.', gu: 'આ ઑર્ડર પૂર્ણ થયો છે. પાછા જઈને ફરી ખોલો.' };

const CASES: [string, { message?: unknown; error?: unknown }, { en: string; gu: string }][] = [
  ['not enough stock on add or change', refused('Insufficient stock. Available: 3, Requested: 10'),
    { en: 'Only 3 bags in stock.', gu: 'સ્ટોકમાં ફક્ત ૩ નંગ છે.' }],
  ['one bag left', refused('Insufficient stock. Available: 1, Requested: 2'),
    { en: 'Only 1 bag in stock.', gu: 'સ્ટોકમાં ફક્ત ૧ નંગ છે.' }],
  ['a large stock number', refused('Insufficient stock. Available: 1250, Requested: 2000'),
    { en: 'Only 1,250 bags in stock.', gu: 'સ્ટોકમાં ફક્ત ૧,૨૫૦ નંગ છે.' }],
  ['the lot is already on the order', refused('Item already exists in order'),
    { en: 'This lot is already in the order.', gu: 'આ જથ્થો ઑર્ડરમાં પહેલેથી છે.' }],
  ['fewer than already dispatched', refused('Quantity cannot be below the 4 already dispatched'),
    { en: '4 bags already dispatched. Choose that many or more.', gu: '૪ નંગ ની જાવક થઈ ચૂકી છે. એટલા કે વધુ નંગ પસંદ કરો.' }],
  ['add to an order that is not open', refused('Cannot add items to DISPATCHED orders', { code: 'ORDER_NOT_OPEN' }), ORDER_CLOSED],
  ['change on an order that is not open', refused('Cannot change items on CLOSED orders', { code: 'ORDER_NOT_OPEN' }), ORDER_CLOSED],
  ['remove from an order that is not open', refused('Cannot remove items from closed orders', { code: 'ORDER_NOT_OPEN' }), ORDER_CLOSED],
  ['the sentence alone, without the code', refused('Cannot add items to DISPATCHED orders'), ORDER_CLOSED],
  ['the code alone, as a string', { message: undefined, error: 'ORDER_NOT_OPEN' }, ORDER_CLOSED],
  ['a lot of another customer (raised 42501)', raised('Item belongs to another customer'),
    { en: 'This stock belongs to another customer.', gu: 'આ માલ બીજા વેપારીનો છે.' }],
  ['no access to this customer (raised 42501)', raised('Customer access denied'),
    { en: 'You do not have permission to perform this action.', gu: 'તમને આ કામ કરવાની પરવાનગી નથી.' }],
  ['database text from add', refused('Error adding item: duplicate key value violates unique constraint "order_items_pkey"'), NOT_SAVED],
  ['database text from change', refused('Error updating quantity: null value in column "current_stock" violates not-null constraint'), NOT_SAVED],
  ['database text from remove', refused('Error removing item: deadlock detected'), NOT_SAVED],
  ['database text that quotes a known sentence', refused('Error adding item: Insufficient stock. Available: 3, Requested: 10'), NOT_SAVED],
  ['a raw database error', raised('permission denied for function add_item_to_order'), NOT_SAVED],
  ['the order was not found', refused('Order not found'), NOT_SAVED],
  ['no connection', { message: "Couldn't add the item.", error: 'Network request failed' }, NOT_SAVED],
  ['an empty answer', { message: "Couldn't add the item.", error: 'EMPTY_RESPONSE' }, NOT_SAVED],
  ['nothing at all', {}, NOT_SAVED],
];

describe.each(['en', 'gu'] as const)('in %s', language => {
  it.each(CASES)('%s', (_name, failure, expected) => {
    setLanguage(language);
    expect(cartFailureReason(failure)).toBe(expected[language]);
  });

  it('never shows database text or a stored status value', () => {
    setLanguage(language);
    const shown = CASES.map(([, failure]) => cartFailureReason(failure)).join('\n');
    expect(shown).not.toMatch(/DISPATCHED|CLOSED|closed orders|ORDER_NOT_OPEN|API_ERROR|EMPTY_RESPONSE/);
    expect(shown).not.toMatch(/duplicate key|constraint|deadlock|violates|permission denied|Error (adding|updating|removing)|Requested/i);
  });
});

it('answers for a missing failure', () => {
  expect(cartFailureReason(undefined)).toBe(NOT_SAVED.en);
  expect(cartFailureReason(null)).toBe(NOT_SAVED.en);
});

it('tells a line that is already gone from any other refusal', () => {
  expect(isAlreadyRemoved(refused('Order item not found'))).toBe(true);
  expect(isAlreadyRemoved(refused('Order not found'))).toBe(false);
  expect(isAlreadyRemoved(refused('Cannot remove items from DISPATCHED orders', { code: 'ORDER_NOT_OPEN' }))).toBe(false);
  expect(isAlreadyRemoved(undefined)).toBe(false);
});
