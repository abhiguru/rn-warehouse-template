/**
 * The GRN list's "Show 9 GRNs" counts receipts (backend migration 98). A facility without 98
 * counts lines, so the count is not used there and the button reads "Show results".
 */
import { getAllGRNItems, getAssignedCustomerGRNItems } from '@/services/grn-service';
import { GRN_FILTERS } from '../configs/grn';
import type { FilterContext } from '../types';

jest.mock('@/services/grn-service', () => ({
  getAllGRNItems: jest.fn(),
  getAssignedCustomerGRNItems: jest.fn(),
  withReceiptPages: (request: { p_filters?: object }) => ({ ...request, p_filters: { ...request.p_filters, page_by: 'receipt' } }),
}));

const staff: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };
const customer: FilterContext = {
  role: 'customer',
  isWarehouseRole: false,
  assignedCustomers: [{ id: 'customer-fictional-1', label: 'Fictional Orchard' }, { id: 'customer-fictional-2', label: 'Fictional Farm' }],
};
const reply = (unit: 'line' | 'receipt' | undefined, total: number) => ({
  success: true,
  message: '',
  data: { items: [], pagination: { total_count: total, limit: 1, offset: 0, has_more: true, unit } },
});

beforeEach(() => jest.clearAllMocks());

it('asks for receipt pages and returns the number of GRNs', async () => {
  jest.mocked(getAllGRNItems).mockResolvedValue(reply('receipt', 9) as never);
  await expect(GRN_FILTERS.fetchCount!({ p_sort_by: 'gr_no', p_sort_order: 'desc' }, staff)).resolves.toBe(9);
  expect(getAllGRNItems).toHaveBeenCalledWith(expect.objectContaining({ p_limit: 1, p_offset: 0, p_filters: { page_by: 'receipt' } }));
});

it('counts a customer account across its customers in GRNs too', async () => {
  jest.mocked(getAssignedCustomerGRNItems).mockResolvedValue(reply('receipt', 4) as never);
  await expect(GRN_FILTERS.fetchCount!({ p_sort_by: 'gr_no', p_sort_order: 'desc' }, customer)).resolves.toBe(4);
  expect(getAssignedCustomerGRNItems).toHaveBeenCalledWith(['customer-fictional-1', 'customer-fictional-2'], expect.objectContaining({ p_filters: { page_by: 'receipt' } }));
});

it('gives no number when the facility counts lines (no migration 98)', async () => {
  jest.mocked(getAllGRNItems).mockResolvedValue(reply('line', 37) as never);
  await expect(GRN_FILTERS.fetchCount!({ p_sort_by: 'gr_no', p_sort_order: 'desc' }, staff)).rejects.toThrow();
});
