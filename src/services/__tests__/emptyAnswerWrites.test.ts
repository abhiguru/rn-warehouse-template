/**
 * An empty 200 to a customer or item change (owner decision 3, 2026-11-01): the response says the answer was lost, so a form
 * of a saved record reads it again, and a create (no request key) asks to check the list first.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { t } from '@/i18n';
import { customerService } from '../customer-service';
import { itemService } from '../item-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const ID = '11111111-2222-4333-8444-555555555555';
beforeEach(() => {
  jest.clearAllMocks();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
  const rpc = jest.fn(async () => ({ data: null, error: null }));
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc, from: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

const lost = { success: false, lostAnswer: true, message: t('errors.general.writeNotConfirmed') };

it('creating a customer says it could not be confirmed and asks to check the list', async () => {
  expect(await customerService.createCustomer({ p_name: 'Fictional Traders', p_mobile: '9876543210' } as never)).toMatchObject(lost);
});

it('updating a customer is a lost answer, so the form reads the customer again', async () => {
  expect(await customerService.updateCustomer({ p_customer_id: ID, p_name: 'Fictional Traders' } as never)).toMatchObject(lost);
});

it('creating and updating an item are lost answers', async () => {
  expect(await itemService.createItem({ p_name: 'Fictional Onions' } as never)).toMatchObject(lost);
  expect(await itemService.updateItem({ p_item_id: ID, p_name: 'Fictional Onions' } as never)).toMatchObject(lost);
});

it('deleting an item says it may have been deleted, and is a lost answer', async () => {
  expect(await itemService.deleteItem(ID)).toMatchObject({ success: false, lostAnswer: true, message: t('errors.parsed.timeoutDeleteForm') });
});
