import { getAuthenticatedClient, getCurrentConfig } from '@/config/supabaseConfig';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { clearAutocompleteCache, getGRNAutocomplete, getDispatchAutocomplete } from '../autocomplete-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getCurrentConfig: jest.fn(),
}));

const rpc = jest.fn();
const data = { items: [], customers: [], grnNumbers: [], summary: { totalResults: 0 }, query: 'po', limit: 10 };
beforeEach(() => {
  jest.clearAllMocks();
  clearAutocompleteCache();
  jest.mocked(getCurrentConfig).mockReturnValue({ url: 'https://first.example', anonKey: 'public' });
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as any);
  rpc.mockResolvedValue({ data, error: null });
});

describe.each([
  ['GRN', getGRNAutocomplete, 'get_grn_autocomplete'],
  ['dispatch', getDispatchAutocomplete, 'get_dispatch_autocomplete'],
] as const)('%s searches', (_label, search, name) => {
  it('reauthorizes repeated queries instead of returning cached business data', async () => {
    expect(await search(' PO ')).toMatchObject({ success: true, data });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Permission denied' } });
    expect(await search(' PO ')).toMatchObject({ success: false });
    expect(getAuthenticatedClient).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith(name, { p_search_query: 'po', p_limit: 10 });
  });

  it('does not fetch or expose data without a session', async () => {
    await search('po');
    rpc.mockClear();
    jest.mocked(getAuthenticatedClient).mockRejectedValueOnce(new Error('Sign in required'));
    const result = await search('po');
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['account', 'origin', 'reset'])('discards pending results after %s changes', async change => {
    let finish!: (value: unknown) => void;
    let started!: () => void;
    const requested = new Promise<void>(resolve => { started = resolve; });
    rpc.mockImplementationOnce(() => {
      started();
      return new Promise(resolve => { finish = resolve; });
    });
    const pending = search('po');
    await requested;
    if (change === 'account') advanceSessionGeneration();
    if (change === 'origin') jest.mocked(getCurrentConfig).mockReturnValue({ url: 'https://second.example', anonKey: 'public' });
    if (change === 'reset') clearAutocompleteCache();
    finish({ data, error: null });
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
  });
});
