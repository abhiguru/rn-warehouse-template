/**
 * The names the facility gave for customers in this run of the app: kept by
 * customer id, looked up once for a customer that has none, and forgotten when
 * the session changes.
 */
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import {
  forgetCustomerNames,
  lookUpCustomerName,
  readCustomerNames,
  subscribeCustomerNames,
  trustCustomerName,
  trustedCustomerName,
} from '../customerNames';

// The real question to the facility, not the stand-in every other test gets (jest.setup.js).
jest.unmock('@/features/reports/customerNames');

type Answer = { data: { id: string; name: string | null }[] | null; error: Error | null };
/** What the facility's `customers` table answers; replaced per test. */
let mockAnswer: () => Promise<Answer>;
const mockQuery = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        in: (column: string, ids: string[]) => {
          mockQuery(table, columns, column, ids);
          return mockAnswer();
        },
      }),
    }),
  }),
}));

const rows = (...found: [string, string | null][]) => async (): Promise<Answer> => ({
  data: found.map(([id, name]) => ({ id, name })),
  error: null,
});
/** One turn of the event loop: every promise already resolved has run by then. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  forgetCustomerNames();
  mockQuery.mockClear();
  mockAnswer = rows();
});

describe('a name the facility gave', () => {
  it('is kept by customer id, and the subscribers are told once', () => {
    const told = jest.fn();
    const stop = subscribeCustomerNames(told);
    expect(trustedCustomerName('c1')).toBe('');

    trustCustomerName('c1', 'Riverbank Produce');
    expect(trustedCustomerName('c1')).toBe('Riverbank Produce');
    expect(trustedCustomerName('c2')).toBe('');
    expect(told).toHaveBeenCalledTimes(1);

    // The same name again changes nothing.
    trustCustomerName('c1', 'Riverbank Produce');
    expect(told).toHaveBeenCalledTimes(1);

    stop();
    trustCustomerName('c2', 'Green Valley Traders');
    expect(told).toHaveBeenCalledTimes(1);
  });

  it.each([['an empty name', ''], ['no name', null], ['nothing', undefined]])('is not replaced by %s', (_what, name) => {
    trustCustomerName('c1', 'Riverbank Produce');
    trustCustomerName('c1', name);
    trustCustomerName('', 'Nobody');
    expect(trustedCustomerName('c1')).toBe('Riverbank Produce');
    expect(trustedCustomerName('')).toBe('');
  });
});

describe('the lookup of a customer that has no name here', () => {
  it('reads customers(id, name) for that id once, and keeps the name the facility gives', async () => {
    mockAnswer = rows(['c1', 'Riverbank Produce']);
    const told = jest.fn();
    subscribeCustomerNames(told);

    lookUpCustomerName('c1');
    lookUpCustomerName('c1');
    // Nothing is known until the facility has answered.
    expect(trustedCustomerName('c1')).toBe('');
    expect(told).not.toHaveBeenCalled();

    await settle();
    expect(mockQuery.mock.calls).toEqual([['customers', 'id, name', 'id', ['c1']]]);
    expect(trustedCustomerName('c1')).toBe('Riverbank Produce');
    expect(told).toHaveBeenCalledTimes(1);

    // A customer whose name is held is not asked for.
    lookUpCustomerName('c1');
    await settle();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('asks nothing for a customer whose name a row already gave', async () => {
    trustCustomerName('c1', 'Riverbank Produce');
    lookUpCustomerName('c1');
    lookUpCustomerName('');
    await settle();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each([
    ['no row (the account may not see the customer)', rows()],
    ['a row with no name', rows(['c1', null])],
  ])('keeps nothing when the facility returns %s, and does not ask again in this session', async (_what, answer) => {
    mockAnswer = answer;
    lookUpCustomerName('c1');
    await settle();
    expect(trustedCustomerName('c1')).toBe('');

    lookUpCustomerName('c1');
    await settle();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the facility refuses the read', async (): Promise<Answer> => ({ data: null, error: new Error('permission denied') })],
    ['no answer comes', () => Promise.reject(new Error('Network request failed'))],
  ])('keeps nothing when %s, and asks again the next time the name is needed', async (_what, failure) => {
    mockAnswer = failure;
    lookUpCustomerName('c1');
    await settle();
    expect(trustedCustomerName('c1')).toBe('');

    mockAnswer = rows(['c1', 'Riverbank Produce']);
    lookUpCustomerName('c1');
    await settle();
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(trustedCustomerName('c1')).toBe('Riverbank Produce');
  });
});

describe('a read of several names (the customer picker)', () => {
  it('returns the names by id, an empty one for a customer without a name, and keeps those it read', async () => {
    mockAnswer = rows(['c1', 'Riverbank Produce'], ['c2', null]);
    await expect(readCustomerNames(['c1', 'c2', 'c3'])).resolves.toEqual({ c1: 'Riverbank Produce', c2: '' });
    expect(mockQuery.mock.calls).toEqual([['customers', 'id, name', 'id', ['c1', 'c2', 'c3']]]);
    expect(trustedCustomerName('c1')).toBe('Riverbank Produce');
    expect(trustedCustomerName('c2')).toBe('');
  });

  it('fails when the facility refuses, and keeps nothing', async () => {
    const refused = new Error('permission denied');
    mockAnswer = async () => ({ data: null, error: refused });
    await expect(readCustomerNames(['c1'])).rejects.toBe(refused);
    expect(trustedCustomerName('c1')).toBe('');
  });
});

describe('a change of session', () => {
  it('forgets every name, tells the subscribers, and lets a customer be asked for again', async () => {
    mockAnswer = rows(['c2', null]);
    trustCustomerName('c1', 'Riverbank Produce');
    lookUpCustomerName('c2');
    await settle();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const told = jest.fn();
    subscribeCustomerNames(told);

    // Sign-out, forced sign-out, a new sign-in and a facility switch all advance the session.
    advanceSessionGeneration();
    expect(trustedCustomerName('c1')).toBe('');
    expect(told).toHaveBeenCalledTimes(1);

    mockAnswer = rows(['c2', 'Green Valley Traders']);
    lookUpCustomerName('c2');
    await settle();
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(trustedCustomerName('c2')).toBe('Green Valley Traders');
  });

  it('drops a name that was asked for before the change and answered after it', async () => {
    const answers: ((value: Answer) => void)[] = [];
    mockAnswer = () => new Promise<Answer>(resolve => { answers.push(resolve); });
    lookUpCustomerName('c1');
    const picker = readCustomerNames(['c2']);
    await settle();
    expect(answers).toHaveLength(2);

    advanceSessionGeneration();
    answers[0]({ data: [{ id: 'c1', name: 'Riverbank Produce' }], error: null });
    answers[1]({ data: [{ id: 'c2', name: 'Green Valley Traders' }], error: null });
    // The one who asked still gets the answer; it is only not kept for the next session.
    await expect(picker).resolves.toEqual({ c2: 'Green Valley Traders' });
    await settle();
    expect(trustedCustomerName('c1')).toBe('');
    expect(trustedCustomerName('c2')).toBe('');
  });
});
