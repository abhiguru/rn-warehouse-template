import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getInvoiceItemsDetailed } from '../invoice-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const DISPATCH = 'dddddddd-2222-4333-8444-555555555555';

/** One line as get_invoice_items_detailed returns it (backend migrations 10 and 41). */
const serverLine = {
  id: 'line-1',
  item_id: 'catalog-1',
  duration: 1.5,
  no_of_days: 31,
  charge: 5,
  labour_rate: 2,
  tax: 5,
  // ONE_TIME GRN: 100 x 5, no duration, no labour; tax 25.
  tax_amount: 25,
  total_amount: 525,
  dispatch_qty: 100,
  grn_quantity: 100,
  item_name: 'Example Potatoes',
  gr_no: 'A0010',
  dispatch_id: DISPATCH,
  dispatch_no: 'I2660',
  dispatch_date: '2026-10-01T00:00:00Z',
  package_mark: 'M1',
  rack: 'R1',
  weight: 50,
  packaging: 'Bag',
  catalog: { id: 'catalog-1', name: 'Example Potatoes', packaging: 'Bag' },
  grn_item: { id: 'grn-item-1', name: 'Example Potatoes', original_quantity: 100, package_mark: 'M1', rack: 'R1', weight: 50, packaging: 'Bag' },
  dispatch: { id: 'disp-line-1', disp_id: DISPATCH, dispatch_no: 'I2660', dispatch_date: '2026-10-01T00:00:00Z', quantity: 100 },
};

function mockAnswer(data: unknown) {
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc: jest.fn(async () => ({ data, error: null })) });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe.each([
  ['the object the server sends', { success: true, data: { items: [serverLine], summary: { total_items: 1, total_quantity: 100, total_amount: 525 } } }],
  ['a bare list of lines', [serverLine]],
])('invoice lines from %s', (_name, answer) => {
  it('carry the server\'s line tax and line total, apart from the tax rate', async () => {
    mockAnswer(answer);

    const result = await getInvoiceItemsDetailed('inv-1');

    expect(result.success).toBe(true);
    expect(result.data!.items).toHaveLength(1);
    expect(result.data!.items[0]).toMatchObject({
      id: 'line-1',
      tax: 5,
      taxAmount: 25,
      totalAmount: 525,
      dispatchQty: 100,
      grnItemId: 'grn-item-1',
      itemName: 'Example Potatoes',
    });
  });

  it('carry the dispatch id and the dispatch number as written', async () => {
    mockAnswer(answer);

    const [line] = (await getInvoiceItemsDetailed('inv-1')).data!.items;

    expect(line.dispatchId).toBe(DISPATCH);
    expect(line.dispatchNo).toBe('I2660');
  });
});

it('does not take a tax amount for the tax rate when the rate is zero', async () => {
  mockAnswer({ success: true, data: { items: [{ ...serverLine, tax: 0, tax_amount: 175 }], summary: {} } });

  const [line] = (await getInvoiceItemsDetailed('inv-1')).data!.items;

  expect(line.tax).toBe(0);
  expect(line.taxAmount).toBe(175);
});
