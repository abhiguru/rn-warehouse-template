/** A customer account whose profile carries ids only: the names are read by id, paged (a direct read is cut at 2,000 rows). */
import { customerSource } from '../pickerSources';
import type { FilterContext } from '../types';

const mockCalls: [string, ...unknown[]][] = [];
let mockPages: { id: string; name: string; city: string | null }[][] = [];
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => {
    const chain: Record<string, unknown> = {};
    for (const step of ['from', 'select', 'in', 'order']) {
      chain[step] = (...args: unknown[]) => { mockCalls.push([step, ...args]); return chain; };
    }
    chain.range = async (...args: unknown[]) => {
      mockCalls.push(['range', ...args]);
      return { data: mockPages.shift() ?? [], error: null };
    };
    return chain;
  },
}));
jest.mock('@/services/search-service', () => ({ searchService: {} }));

const ids = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, label: '' }));
const ctx: FilterContext = { role: 'customer', isWarehouseRole: false, assignedCustomers: ids };
const row = (i: number) => ({ id: `c${i}`, name: `Name ${i}`, city: null });

beforeEach(() => { mockCalls.length = 0; mockPages = []; });

it('reads the names of the assigned customers in one request of 500 when that is enough', async () => {
  mockPages = [[row(0), row(1), row(2)]];
  const options = await customerSource.initial(ctx);
  expect(options.map(o => o.label)).toEqual(['Name 0', 'Name 1', 'Name 2']);
  expect(mockCalls.filter(c => c[0] === 'range')).toEqual([['range', 0, 499]]);
});

it('pages a longer list: a stable order from the second request on, every customer once', async () => {
  const full = (from: number) => Array.from({ length: 500 }, (_, i) => row(from + i));
  mockPages = [full(0), full(0), [row(500)]];
  const options = await customerSource.initial(ctx);
  expect(options).toHaveLength(501);
  expect(mockCalls.filter(c => c[0] === 'range')).toEqual([['range', 0, 499], ['range', 0, 499], ['range', 500, 999]]);
  expect(mockCalls.filter(c => c[0] === 'order' && c[1] === 'id')).toHaveLength(2);
});
