/**
 * The reason on a lot the server refused (phone review 2026-10-14, OI-01): each
 * sentence of the cart functions (backend migration 28) in the app's words, in
 * both languages, and never database text or a stored status value.
 *
 * The answers are written as `OrderService` hands them back: a refusal sent as
 * the answer has the server's sentence in `message`; a raised exception has the
 * app's own text in `message` and the raw text in `error`.
 */
import { cartFailureReason, isAlreadyRemoved, isConnectionFailure, isLineGone, mayHaveBeenSaved } from '../cartFailureReason';
import { setLanguage } from '@/i18n';
import { AppError } from '@/utils/appError';
import { executeRPC } from '@/utils/serviceErrorHandler';

afterEach(() => setLanguage('en'));

const refused = (message: string, error: unknown = 'API_ERROR') => ({ success: false, message, error });
const raised = (text: string) => ({ success: false, message: "Couldn't add the item.", error: text });

const NOT_SAVED = { en: 'Not saved. Check your connection and try again.', gu: 'સચવાયું નથી. તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.' };
// A lost answer: while the editor checks it (waits, reads the order) the lot says it is being checked.
const MAYBE_SAVED = {
  en: 'No answer from the server. Checking whether it was saved…',
  gu: 'સર્વરનો જવાબ મળ્યો નથી. સચવાયું છે કે નહીં તે તપાસી રહ્યા છીએ…',
};
const ORDER_CLOSED = { en: 'This order is closed. Go back and open it again.', gu: 'આ ઑર્ડર પૂર્ણ થયો છે. પાછા જઈને ફરી ખોલો.' };

const CASES: [string, { message?: unknown; error?: unknown; lostAnswer?: boolean }, { en: string; gu: string }][] = [
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
  // The request had gone out and no answer came back (review 2026-10-20, A13): the lot may be on the order; it is being checked.
  // (`lostAnswer` is the flag executeRPC computed and OrderService passes on; the text is not classified here.)
  ['a connection that dropped after the request went out', { message: "Couldn't add the item.", error: 'Network request failed', lostAnswer: true }, MAYBE_SAVED],
  ['a request that timed out', { message: "Couldn't add the item.", error: 'TimeoutError: Request timeout', lostAnswer: true }, MAYBE_SAVED],
  ['a socket that was reset', { message: "Couldn't add the item.", error: 'Error: fetch failed: Connection reset by peer', lostAnswer: true }, MAYBE_SAVED],
  // Nothing was sent: no session that could be renewed, a host that could not be found.
  ['no session that could be renewed (nothing sent)', { message: "Couldn't add the item.", error: 'Network request failed: session refresh unavailable' }, NOT_SAVED],
  ['a host that could not be found (nothing sent)', { message: "Couldn't add the item.", error: 'Error: fetch failed: Unable to resolve host "example.test"' }, NOT_SAVED],
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

describe('a line that is gone (review 2026-10-20, A12)', () => {
  const REMOVED = {
    en: 'Removed by someone else. Tap Add again to add 8 bags.',
    gu: 'બીજા કોઈએ આ જથ્થો દૂર કર્યો. ૮ નંગ ઉમેરવા માટે ફરી "ઉમેરો" દબાવો.',
  };
  it.each(['en', 'gu'] as const)('a change of a known line that "Order item not found" is read as removed by someone else, in %s', language => {
    setLanguage(language);
    expect(cartFailureReason(refused('Order item not found'), { lineKnown: true, chosen: 8 })).toBe(REMOVED[language]);
  });

  it('a customer login on an older facility is answered "Customer access denied": the line is gone only when a read of the order says so', () => {
    expect(cartFailureReason(raised('Customer access denied'), { lineKnown: true, lineConfirmedGone: true, chosen: 8 })).toBe(REMOVED.en);
    // Without that read it is a refusal of permission, also for a known line; and without the line known (an add).
    expect(cartFailureReason(raised('Customer access denied'), { lineKnown: true, chosen: 8 })).toBe('You do not have permission to perform this action.');
    expect(cartFailureReason(raised('Customer access denied'))).toBe('You do not have permission to perform this action.');
    expect(cartFailureReason(raised('Customer access denied'), { lineKnown: false, lineConfirmedGone: true, chosen: 8 })).toBe('You do not have permission to perform this action.');
  });

  it('a line gone with no quantity chosen has its own reason, not a dialog title', () => {
    expect(cartFailureReason(refused('Order item not found'), { lineKnown: true })).toBe('This item is no longer on the order.');
  });

  // In Gujarati executeRPC puts the app's own text in `message`; the server's sentence is kept in `serverMessage`.
  it.each(['en', 'gu'] as const)('"Order item not found" is told through executeRPC in %s', async language => {
    setLanguage(language);
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = async () => ({ rpc: async () => ({ data: { success: false, message: 'Order item not found' }, error: null }) });
    const result = await executeRPC(client, 'update_order_item_quantity', {}, { context: 'fictional', errorMessage: "Couldn't change the item.", unwrapNested: false });
    logged.mockRestore();
    expect(result.serverMessage).toBe('Order item not found');
    expect(isAlreadyRemoved(result)).toBe(true);
    expect(cartFailureReason(result, { lineKnown: true, chosen: 8 })).toBe(REMOVED[language]);
  });

  it('is told from a line that is only missing something else', () => {
    expect(isLineGone(refused('Order item not found'))).toBe(true);
    expect(isLineGone(raised('Customer access denied'))).toBe(true);
    expect(isLineGone(refused('Order not found'))).toBe(false);
    expect(isLineGone(raised('Staff access required'))).toBe(false);
    expect(isLineGone(undefined)).toBe(false);
    // Only "not found" says for certain that the line is gone.
    expect(isAlreadyRemoved(raised('Customer access denied'))).toBe(false);
  });

  it('a stock refusal still wins over the line being known', () => {
    expect(cartFailureReason(refused('Insufficient stock. Available: 3, Requested: 10'), { lineKnown: true, chosen: 10 })).toBe('Only 3 bags in stock.');
  });
});

describe('a call that may have been applied (review 2026-10-20, A13)', () => {
  it.each(['en', 'gu'] as const)('a removal that got no answer says it is checking whether it was deleted, in %s', language => {
    setLanguage(language);
    const timedOut = { message: "Couldn't remove the item.", error: 'TimeoutError: Request timeout', lostAnswer: true };
    expect(cartFailureReason(timedOut, { removal: true })).toBe(
      language === 'en' ? 'No answer from the server. Checking whether it was deleted…' : 'સર્વરનો જવાબ મળ્યો નથી. કાઢી નંખાયું છે કે નહીં તે તપાસી રહ્યા છીએ…'
    );
  });

  it('is the flag executeRPC computed, and nothing else', () => {
    expect(mayHaveBeenSaved({ ...raised('TimeoutError: Request timeout'), lostAnswer: true })).toBe(true);
    // The text alone does not say it: the status and the code were seen where the flag was made.
    expect(mayHaveBeenSaved(raised('TimeoutError: Request timeout'))).toBe(false);
    expect(mayHaveBeenSaved({})).toBe(false);
    expect(mayHaveBeenSaved(undefined)).toBe(false);
    expect(mayHaveBeenSaved(null)).toBe(false);
  });

  // The flag as executeRPC makes it from what the PostgREST client hands back (the status and the code are known there).
  describe.each(['en', 'gu'] as const)('through executeRPC in %s', language => {
    beforeEach(() => setLanguage(language));
    const lostFlag = async (answer: { data: unknown; error: unknown; status?: number }) => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const result = await executeRPC(async () => ({ rpc: async () => answer }), 'add_item_to_order', {}, { context: 'fictional', write: true, unwrapNested: false });
      logged.mockRestore();
      return mayHaveBeenSaved(result);
    };
    const failed = (message: string, extra: { code?: string; status?: number } = {}) => ({
      data: null,
      error: { message, details: '', hint: '', code: extra.code ?? '' },
      ...(extra.status ? { status: extra.status } : {}),
    });

    it.each([
      ['a timeout', failed('TimeoutError: Request timeout'), true],
      ['a dropped connection', failed('TypeError: Network request failed'), true],
      ['a gateway page', failed('<html>502 Bad Gateway</html>', { status: 502 }), true],
      ['a gateway\'s plain 504 answer', failed('The upstream server is timing out', { status: 504 }), true],
      ['a gateway answer that carries only its status', failed('Bad Gateway', { status: 502 }), true],
      ['a statement timeout (rolled back)', failed('canceling statement due to statement timeout', { code: '57014', status: 500 }), false],
      ['a host that could not be found', failed('Error: fetch failed: Unable to resolve host "example.test"'), false],
      ['a refusal sentence', failed('Item belongs to another customer', { code: '42501', status: 403 }), false],
      ['a PostgREST refusal with a high status', failed('boom', { code: 'PGRST116', status: 503 }), false],
    ])('%s', async (_name, answer, expected) => {
      expect(await lostFlag(answer)).toBe(expected);
    });

    it('no session that could be renewed for want of a connection is nothing sent', async () => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const result = await executeRPC(
        async () => { throw new AppError('NETWORK', 'Network request failed: session refresh unavailable'); },
        'add_item_to_order', {}, { context: 'fictional', write: true, unwrapNested: false }
      );
      logged.mockRestore();
      expect(mayHaveBeenSaved(result)).toBe(false);
    });
  });
});

it('tells a line that is already gone from any other refusal', () => {
  expect(isAlreadyRemoved(refused('Order item not found'))).toBe(true);
  expect(isAlreadyRemoved(refused('Order not found'))).toBe(false);
  expect(isAlreadyRemoved(refused('Cannot remove items from DISPATCHED orders', { code: 'ORDER_NOT_OPEN' }))).toBe(false);
  expect(isAlreadyRemoved(undefined)).toBe(false);
});

describe('a call without an answer is told from a refusal', () => {
  it.each([
    ['a request that timed out', 'TimeoutError: Request timeout'],
    ['a request that could not be sent', 'TypeError: Network request failed'],
    ['a session that could not be renewed for want of a connection', 'Network request failed: session refresh unavailable'],
    ['a connection the server dropped', 'Error: read ECONNRESET'],
  ])('%s got no answer', (_name, text) => {
    expect(isConnectionFailure(raised(text))).toBe(true);
  });

  const NO_ANSWER = [
    'a connection that dropped after the request went out',
    'a request that timed out',
    'a socket that was reset',
    'no session that could be renewed (nothing sent)',
    'a host that could not be found (nothing sent)',
  ];
  it.each(CASES.filter(([name]) => !NO_ANSWER.includes(name)))('%s is an answer', (_name, failure) => {
    expect(isConnectionFailure(failure)).toBe(false);
  });

  it.each([
    ['the session changed', raised('Error: Session changed')],
    ['the session ended', raised('Sign in required')],
    ['a line that is already gone', refused('Order item not found')],
    ['a missing failure', undefined],
    ['null', null],
  ])('%s is not a connection failure', (_name, failure) => {
    expect(isConnectionFailure(failure)).toBe(false);
  });

  // What the service wrapper of the three cart calls makes of the PostgREST
  // client's answers, in both languages: the text read here stays English.
  describe.each(['en', 'gu'] as const)('through executeRPC in %s', language => {
    let logged: jest.SpyInstance;
    beforeEach(() => {
      setLanguage(language);
      logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => logged.mockRestore());

    const call = (client: () => Promise<unknown>) =>
      executeRPC(client, 'add_item_to_order', {}, { context: 'fictional', errorMessage: "Couldn't add the item.", unwrapNested: false });
    const answering = (answer: { data: unknown; error: unknown }) => async () => ({ rpc: async () => answer });
    // A failed fetch, as postgrest-js 2 reports it: no status, the error's name and message as text.
    const transport = (text: string) => answering({ data: null, error: { message: text, details: '', hint: '', code: '' } });

    it.each([
      ['a timeout of the gated fetch', transport('TimeoutError: Request timeout')],
      ['a fetch that failed', transport('TypeError: Network request failed')],
      ['no session for want of a connection', async () => { throw new AppError('NETWORK', 'Network request failed: session refresh unavailable'); }],
    ])('%s got no answer', async (_name, client) => {
      expect(isConnectionFailure(await call(client))).toBe(true);
    });

    it.each([
      ['a refusal sent as the answer', answering({ data: { success: false, message: 'Insufficient stock. Available: 3, Requested: 10' }, error: null })],
      ['an order that is not open', answering({ data: { success: false, message: 'Cannot add items to DISPATCHED orders', error: { code: 'ORDER_NOT_OPEN' } }, error: null })],
      ['a raised access refusal', answering({ data: null, error: { message: 'Customer access denied', details: null, hint: null, code: '42501' } })],
      ['an empty answer', answering({ data: null, error: null })],
    ])('%s is an answer', async (_name, client) => {
      expect(isConnectionFailure(await call(client))).toBe(false);
    });
  });
});
