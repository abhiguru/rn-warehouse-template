/**
 * The GRN number typed in the new-invoice picker reaches the server whole,
 * and its `%`, `_` and `\` are matched as characters: the server puts the
 * text into an ILIKE pattern, where they would otherwise be wildcards.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getInvoiceableGrns } from '../invoiceFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));

const rpc = jest.fn();
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: [], error: null });
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
});

const sentSearch = async (typed?: string) => {
  await getInvoiceableGrns(typed);
  return rpc.mock.calls[0][1].p_search_grn_no;
};

describe('getInvoiceableGrns search text', () => {
  it('is not cut at an underscore', async () => {
    expect(await sentSearch('A_12')).toBe('A\\_12');
  });

  it.each([
    ['%', '\\%'],
    ['_', '\\_'],
    ['A\\1', 'A\\\\1'],
  ])('sends %p as the literal %p', async (typed, sent) => {
    expect(await sentSearch(typed)).toBe(sent);
  });

  it('sends an ordinary number unchanged, and nothing when the box is empty', async () => {
    expect(await sentSearch('A0010')).toBe('A0010');
    rpc.mockClear();
    expect(await sentSearch(undefined)).toBeNull();
  });
});
