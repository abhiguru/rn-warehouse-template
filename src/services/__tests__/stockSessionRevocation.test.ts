import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { store } from '@/store';
import { forceLogoutOnInvalidToken } from '@/store/slices/authSlice';
import { StockService } from '../stock-service';
import { executeRPC } from '@/utils/serviceErrorHandler';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({
  forceLogoutOnInvalidToken: jest.fn(() => ({ type: 'test/forceLogout' })),
}));

const rpc = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as any);
});

it.each(['rpc', 'envelope', 'exception'])(
  'invalidates a revoked stock session delivered as %s', async kind => {
    const error = { code: '42501', message: 'Session expired or revoked' };
    if (kind === 'exception') rpc.mockRejectedValueOnce(new Error(error.message));
    else rpc.mockResolvedValueOnce(kind === 'rpc'
      ? { error, data: null }
      : { error: null, data: { success: false, message: error.message } });
    expect(await StockService.getCustomerStockAnalysis('fictional-customer')).toMatchObject({ success: false });
    expect(forceLogoutOnInvalidToken).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'test/forceLogout' });
  }
);

it.each(['Customer access denied', 'Network request failed'])(
  'preserves valid credentials on %s', async message => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message } });
    expect(await StockService.getCustomerStockAnalysis('fictional-customer')).toMatchObject({ success: false, message });
    expect(store.dispatch).not.toHaveBeenCalled();
  }
);

it.each(['envelope', 'exception'])(
  'shared RPC handling invalidates definitive revocation in %s', async kind => {
    if (kind === 'exception') rpc.mockRejectedValueOnce(new Error('Session expired or revoked'));
    else rpc.mockResolvedValueOnce({ error: null, data: { success: false, message: 'Session expired or revoked' } });
    expect(await executeRPC(getAuthenticatedClient, 'fictional_rpc', {}, { context: 'test' })).toMatchObject({ success: false });
    expect(store.dispatch).toHaveBeenCalledTimes(1);
  }
);
