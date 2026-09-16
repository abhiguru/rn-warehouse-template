import { getAuthenticatedClient, getSupabaseClient } from '@/config/supabaseConfig';
import { searchItems } from '../item-search-service';
import { getVehicleSuggestions } from '../vehicle-suggestion-service';
import { searchService } from '../search-service';
import { getUserByIdDirect } from '../user-core-service';
import { OrderService } from '../order-service';
import { checkItemsHaveDispatches } from '@/features/grn/services/grnFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(() => { throw new Error('Anonymous business access'); }),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({}));

const rpc = jest.fn();
const from = jest.fn();
const chain = { select: jest.fn(), eq: jest.fn(), gt: jest.fn(), single: jest.fn(), limit: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc, from } as any);
  from.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
});
afterEach(() => expect(getSupabaseClient).not.toHaveBeenCalled());

it('fetches GRN item-entry results with the custom authenticated client', async () => {
  rpc.mockResolvedValue({ data: { items: [{ id: 'potato', name: 'Potato', packaging: 'Bags' }] }, error: null });
  expect(await searchItems('Potato')).toEqual([{ id: 'potato', name: 'Potato', packaging: 'Bags' }]);
  expect(rpc).toHaveBeenCalledWith('search_items_autocomplete', { p_search_query: 'Potato', p_active_only: true, p_limit: 20 });
});

it('fetches vehicle suggestions with the custom authenticated client', async () => {
  rpc.mockResolvedValue({ data: { suggestions: [{ registration: 'DEMO1', usage_count: 1 }] }, error: null });
  expect(await getVehicleSuggestions()).toEqual([{ registration: 'DEMO1', usage_count: 1 }]);
  expect(rpc).toHaveBeenCalledWith('get_vehicle_suggestions', expect.any(Object));
});

it('searches GRN numbers with the custom authenticated client', async () => {
  rpc.mockResolvedValue({ data: { grns: [{ id: 'grn', gr_no: 'A0001', customer_name: 'Demo', date: '2026-09-15' }] }, error: null });
  expect(await searchService.searchGRNNumbers('A0001')).toEqual([expect.objectContaining({ value: 'grn', label: 'A0001' })]);
  expect(rpc).toHaveBeenCalledWith('get_grn_list', expect.objectContaining({ p_filters: { gr_no: 'A0001' } }));
});

it('loads profile and assignments through authenticated queries', async () => {
  chain.single.mockResolvedValue({ data: { id: 'profile', auth_user_id: 'user', name: 'Demo', role: 'customer' }, error: null });
  rpc.mockResolvedValue({ data: ['customer-a'], error: null });
  expect(await getUserByIdDirect('user')).toMatchObject({ status: 'success', data: { assignedCustomerIds: ['customer-a'] } });
  expect(from).toHaveBeenCalledWith('user_profiles');
  expect(rpc).toHaveBeenCalledWith('user_accessible_customers');
});

it('calculates order summaries through authenticated queries', async () => {
  chain.gt.mockResolvedValue({ data: [{ requested_quantity: 20 }, { requested_quantity: 5 }], error: null });
  expect(await OrderService.getOrderSummary('order')).toMatchObject({ success: true, data: { item_count: 2, total_quantity: 25 } });
  expect(from).toHaveBeenCalledWith('order_items');
});

it('checks existing dispatches through authenticated queries', async () => {
  chain.limit.mockResolvedValue({ data: [{ id: 'dispatch' }], error: null });
  expect(await checkItemsHaveDispatches('grn')).toMatchObject({ success: true, hasDispatches: true });
  expect(from).toHaveBeenCalledWith('dispatch_trl');
});

it('does not query business data when authentication fails', async () => {
  jest.mocked(getAuthenticatedClient).mockRejectedValue(new Error('Sign in required'));
  expect(await searchItems('Potato')).toEqual([]);
  expect(await getVehicleSuggestions()).toEqual([]);
  expect(await searchService.searchGRNNumbers('A0001')).toEqual([]);
  expect((await getUserByIdDirect('user')).status).toBe('error');
  expect(rpc).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
});


it('does not report an order empty after authorization or connection failure', async () => {
  chain.gt.mockResolvedValue({ count: 0, error: { message: 'Permission denied' } });
  expect(await OrderService.isOrderEmpty('order')).toBe(false);
  jest.mocked(getAuthenticatedClient).mockRejectedValueOnce(new Error('Offline'));
  expect(await OrderService.isOrderEmpty('order')).toBe(false);
});
