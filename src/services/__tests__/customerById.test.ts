import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { customerService } from '../customer-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

/** CR-07: the customers table column is contact_person, not contact_name. */
it('maps the contact_person column to the customer contact_name', async () => {
  const row = {
    id: 'c1', name: 'Test Doc', mobile: '919000000099', contact_person: 'Test Person',
    contact_mobile: '919000000098', document_urls: null, image_urls: null, active: true,
  };
  const single = jest.fn(async () => ({ data: row, error: null }));
  const client = { from: () => ({ select: () => ({ eq: () => ({ single }) }) }) };
  (getAuthenticatedClient as jest.Mock).mockResolvedValue(client);

  const result = await customerService.getCustomerById('c1');

  expect(result.success).toBe(true);
  expect(result.data?.contact_name).toBe('Test Person');
});
