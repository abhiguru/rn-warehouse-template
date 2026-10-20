/** updateDevice words a statement timeout (57014) as "not saved", also from a thrown error. */
import { updateDevice } from '../sensor-service';
import { t } from '@/i18n';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));

const update = { deviceId: 'fictional-sensor', name: 'Chamber', location: 'A', stalenessMinutes: 30 } as Parameters<typeof updateDevice>[0];

beforeEach(() => mockRpc.mockReset());

describe('updateDevice', () => {
  it('an RPC error with code 57014 says nothing was saved', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } });
    const result = await updateDevice(update);
    expect(result.success).toBe(false);
    expect(result.message).toBe(t('errors.parsed.timeoutNotSaved'));
  });

  it('a refusal in the answer carries its code to the wording', async () => {
    mockRpc.mockResolvedValue({ data: { success: false, error: 'canceling statement due to statement timeout', error_code: '57014' }, error: null });
    const result = await updateDevice(update);
    expect(result.success).toBe(false);
    expect(result.message).toBe(t('errors.parsed.timeoutNotSaved'));
  });

  it('a thrown timeout is worded as a form save timeout, not the bare fallback', async () => {
    mockRpc.mockRejectedValue(new Error('Request timed out'));
    const result = await updateDevice(update);
    expect(result.message).toBe(t('errors.parsed.timeoutWriteForm'));
  });
});
