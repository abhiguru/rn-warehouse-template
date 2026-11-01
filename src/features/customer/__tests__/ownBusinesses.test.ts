/**
 * The read behind the business chooser on Create order: which rows it asks the
 * facility for, what it hands back, and when it refuses to hand anything back.
 */
import { readOwnBusinesses } from '../ownBusinesses';

let mockGeneration = 1;
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => mockGeneration }));

type Row = { id: string; name: string | null; city: string | null; active?: boolean | null };
let mockAnswer: { data: Row[] | null; error: Error | null } = { data: [], error: null };
/** Runs when the facility answers, before the answer is handed to the reader. */
let mockOnAnswer = () => {};
const mockQuery = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  // The customers table as PostgREST is asked for it: every call of the chain is noted in order.
  getAuthenticatedClient: async () => {
    const chain: Record<string, unknown> = {};
    for (const step of ['from', 'select', 'eq', 'is']) {
      chain[step] = (...args: unknown[]) => {
        mockQuery(step, ...args);
        return chain;
      };
    }
    chain.order = (...args: unknown[]) => {
      mockQuery('order', ...args);
      return chain;
    };
    // The read is paged: the page is the end of the chain.
    chain.range = async (...args: unknown[]) => {
      mockQuery('range', ...args);
      mockOnAnswer();
      return mockAnswer;
    };
    return chain;
  },
}));

beforeEach(() => {
  mockGeneration = 1;
  mockAnswer = { data: [], error: null };
  mockOnAnswer = () => {};
  mockQuery.mockClear();
});

it('asks for the businesses in use, by name, and sends no list of ids', async () => {
  await readOwnBusinesses();
  expect(mockQuery.mock.calls).toEqual([
    ['from', 'customers'],
    ['select', 'id, name, city, active'],
    // A deactivated business still orders its goods out, so there is NO active filter;
    // only a deleted one is left out.
    ['is', 'deleted_at', null],
    ['order', 'name'],
    // Paged, 500 rows a request (a direct read is cut at 2,000 rows).
    ['range', 0, 499],
  ]);
});

it('hands back the rows in the order the facility gave, with an empty city or name for none', async () => {
  mockAnswer = {
    data: [
      { id: 'business-a', name: 'Amber Field Traders', city: 'Northgate' },
      { id: 'business-b', name: 'Birchwood Produce', city: null },
      { id: 'business-c', name: null, city: 'Southmere' },
    ],
    error: null,
  };
  await expect(readOwnBusinesses()).resolves.toEqual([
    { id: 'business-a', name: 'Amber Field Traders', city: 'Northgate', active: true },
    { id: 'business-b', name: 'Birchwood Produce', city: '', active: true },
    { id: 'business-c', name: '', city: 'Southmere', active: true },
  ]);
});

it('hands back an empty list when the facility lists no business for the account', async () => {
  mockAnswer = { data: null, error: null };
  await expect(readOwnBusinesses()).resolves.toEqual([]);
});

it('fails when the facility refuses or cannot be reached', async () => {
  mockAnswer = { data: null, error: new Error('offline') };
  await expect(readOwnBusinesses()).rejects.toThrow('offline');
});

it('hands nothing back when the session changed while the read was out', async () => {
  mockAnswer = { data: [{ id: 'business-a', name: 'Amber Field Traders', city: 'Northgate' }], error: null };
  mockOnAnswer = () => {
    mockGeneration = 2;
  };
  await expect(readOwnBusinesses()).rejects.toThrow('Session changed');
});

it('hands back a deactivated business with active false, and treats a missing flag as active', async () => {
  mockAnswer = {
    data: [
      { id: 'business-a', name: 'Amber Field Traders', city: 'Northgate', active: false },
      { id: 'business-b', name: 'Birchwood Produce', city: null },
    ],
    error: null,
  };
  const rows = await readOwnBusinesses();
  expect(rows.map(r => [r.id, r.active])).toEqual([['business-a', false], ['business-b', true]]);
});

it('pages a list of more than one page: a stable order from the second request on, every business once', async () => {
  const page = (from: number) => Array.from({ length: 500 }, (_, i) => ({ id: `b${from + i}`, name: `N${from + i}`, city: null }));
  const answers = [page(0), page(0), page(500), [{ id: 'b1000', name: 'N1000', city: null }]];
  let call = 0;
  // The fake chain answers from `mockAnswer`; hand it the next page on every request.
  mockQuery.mockImplementation((step: string) => {
    if (step === 'range') mockAnswer = { data: answers[call++] as never, error: null };
  });
  const rows = await readOwnBusinesses();
  expect(rows).toHaveLength(1001);
  expect(new Set(rows.map(r => r.id)).size).toBe(1001);
  const ranges = mockQuery.mock.calls.filter(c => c[0] === 'range').map(c => [c[1], c[2]]);
  expect(ranges).toEqual([[0, 499], [0, 499], [500, 999], [1000, 1499]]);
  expect(mockQuery.mock.calls.filter(c => c[0] === 'order' && c[1] === 'id')).toHaveLength(3);
});
