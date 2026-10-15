import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { itemService } from '../item-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSessionIdentity: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rpc = jest.fn();
let logs: jest.SpyInstance[];
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  logs = ['log', 'warn', 'error'].map(m => jest.spyOn(console, m as 'log').mockImplementation(() => {}));
});
afterEach(() => logs.forEach(l => l.mockRestore()));

const answer = (data: unknown) => rpc.mockResolvedValue({ data: { success: true, message: 'Item created successfully', data }, error: null });

describe('createItem (backend migration 85)', () => {
  it('sends p_rate_from_item only when given', async () => {
    answer({ id: 'i1', rate_source: 'copied' });
    await itemService.createItem({ p_name: 'Fictional Gur Box', p_rate_from_item: 'src-1' });
    expect(rpc).toHaveBeenLastCalledWith('create_item', { p_name: 'Fictional Gur Box', p_rate_from_item: 'src-1' });
    await itemService.createItem({ p_name: 'Fictional Gur Box' });
    expect(rpc).toHaveBeenLastCalledWith('create_item', { p_name: 'Fictional Gur Box' });
  });

  it.each(['standard', 'copied', 'none'] as const)('exposes rate_source %s and the id of the new item', async source => {
    answer({ id: 'i1', name: 'Fictional Gur Box', rate_source: source });
    const result = await itemService.createItem({ p_name: 'Fictional Gur Box' });
    expect(result.success).toBe(true);
    expect(result.data?.rate_source).toBe(source);
    expect(result.data?.id).toBe('i1');
  });

  it('has no rate_source from a server without migration 85, or when it sends something unknown', async () => {
    answer({ id: 'i1' });
    expect((await itemService.createItem({ p_name: 'x' })).data).not.toHaveProperty('rate_source');
    answer({ id: 'i1', rate_source: 'surprise' });
    expect((await itemService.createItem({ p_name: 'x' })).data).not.toHaveProperty('rate_source');
  });
});
