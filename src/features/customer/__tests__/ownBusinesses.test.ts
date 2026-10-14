/**
 * The read behind the business chooser on Create order: which rows it asks the
 * facility for, what it hands back, and when it refuses to hand anything back.
 */
import { readOwnBusinesses } from '../ownBusinesses';

let mockGeneration = 1;
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => mockGeneration }));

type Row = { id: string; name: string | null; city: string | null };
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
    chain.order = async (...args: unknown[]) => {
      mockQuery('order', ...args);
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
    ['select', 'id, name, city'],
    // A deactivated or deleted business stays readable while its assignment stands
    // (the row-level policy looks at the assignment only), so the read leaves it out.
    ['eq', 'active', true],
    ['is', 'deleted_at', null],
    ['order', 'name'],
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
    { id: 'business-a', name: 'Amber Field Traders', city: 'Northgate' },
    { id: 'business-b', name: 'Birchwood Produce', city: '' },
    { id: 'business-c', name: '', city: 'Southmere' },
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
