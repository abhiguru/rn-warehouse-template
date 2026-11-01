/**
 * The report services rebuild rows field by field. The packaging word the server
 * sends on a line must reach the screen as sent: a string, null ("the lots
 * differ") and absent (older server) are three different answers.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getCustomerDispatchActivity } from '../dispatch-activity-service';
import { getCustomerActivityDetail } from '../customer-activity-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getStoredToken: jest.fn(async () => ({ isValid: true, type: 'custom', authToken: 'x' })),
}));

const CUSTOMER = 'cccccccc-1111-4222-8333-444444444444';
const RANGE = { fromDate: '2026-10-01', toDate: '2026-10-11' };
const rpc = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('dispatch activity items', () => {
  it('keeps the packaging word of each line, and leaves an absent one absent', async () => {
    rpc.mockResolvedValue({
      error: null,
      data: {
        success: true,
        summary: { total_dispatches: 1, total_quantity: 3 },
        dispatches: [
          {
            disp_id: 'd1', disp_no: 'D-1', disp_date: '2026-10-05', total_qty: 3,
            items: [
              { item_name: 'Potato', qty: 1, source_grn: 'G-1', packaging: 'Box' },
              { item_name: 'Onion', qty: 1, source_grn: 'G-2', packaging: null },
              { item_name: 'Garlic', qty: 1, source_grn: 'G-3' },
            ],
          },
        ],
      },
    });
    const result = await getCustomerDispatchActivity({ customerId: CUSTOMER, ...RANGE });
    const items = result.data.dispatches[0].items;
    expect(items[0].packaging).toBe('Box');
    expect(items[1].packaging).toBeNull();
    expect(items[2].packaging).toBeUndefined();
  });
});

describe('customer activity top stock items', () => {
  it('keeps the packaging word, null for differing lots, and absent for an older server', async () => {
    rpc.mockResolvedValue({
      error: null,
      data: {
        success: true,
        summary: { current_stock: 30 },
        top_stock_items: [
          { item_name: 'Potato', packaging: 'Crate', total_stock: 10, grn_count: 1 },
          { item_name: 'Onion', packaging: null, total_stock: 10, grn_count: 2 },
          { item_name: 'Garlic', total_stock: 10, grn_count: 1 },
        ],
      },
    });
    const result = await getCustomerActivityDetail({ customerId: CUSTOMER, ...RANGE });
    const rows = result.data.top_stock_items;
    expect(rows[0].packaging).toBe('Crate');
    expect(rows[1].packaging).toBeNull();
    expect(rows[2].packaging).toBeUndefined();
  });
});

describe('customer activity recent GRN and dispatch previews', () => {
  it('keeps the packaging word, null for differing lots, and absent for an older server', async () => {
    rpc.mockResolvedValue({
      error: null,
      data: {
        success: true,
        recent_grns: [
          { grn_id: 'g1', gr_no: 'A1', packaging: 'Box' },
          { grn_id: 'g2', gr_no: 'A2', packaging: null },
          { grn_id: 'g3', gr_no: 'A3' },
        ],
        recent_dispatches: [
          { dispatch_id: 'd1', dispatch_no: 'D1', packaging: 'Crate' },
          { dispatch_id: 'd2', dispatch_no: 'D2', packaging: null },
          { dispatch_id: 'd3', dispatch_no: 'D3' },
        ],
      },
    });
    const { data } = await getCustomerActivityDetail({ customerId: CUSTOMER, ...RANGE });
    expect(data.recent_grns.map(r => r.packaging)).toEqual(['Box', null, undefined]);
    expect(data.recent_dispatches.map(r => r.packaging)).toEqual(['Crate', null, undefined]);
  });
});

describe('customer activity current stock packaging', () => {
  it('keeps the word, null for differing lots, and absent for an older server', async () => {
    const read = async (summary: Record<string, unknown>) => {
      rpc.mockResolvedValue({ error: null, data: { success: true, summary } });
      return (await getCustomerActivityDetail({ customerId: CUSTOMER, ...RANGE })).data.summary.current_stock_packaging;
    };
    expect(await read({ current_stock: 5, current_stock_packaging: 'Box' })).toBe('Box');
    expect(await read({ current_stock: 5, current_stock_packaging: null })).toBeNull();
    expect(await read({ current_stock: 5 })).toBeUndefined();
  });
});
