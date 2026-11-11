/**
 * pairWithFacility (WH-146, WH-170 item 1): while the "Switch to ...?" question waits, the current facility keeps its own
 * warehouse-network context; Cancel changes nothing; Yes sets the new local-only context again.
 */
import { getLanContext, setLanContext } from '../lanTransport';
import { discoverOperator, getActiveOperatorServer } from '../operatorServer';
import { getStoredToken, pairedSignIn } from '../supabaseConfig';
import { switchOperatorServer } from '@/store/operatorSwitch';
import { openPairingAnswer } from '../pairingCrypto';
import { pairWithFacility } from '../localPairing';

let mockContext: unknown = null;
jest.mock('../lanTransport', () => ({
  getLanContext: jest.fn(() => mockContext),
  setLanContext: jest.fn((next: unknown) => { mockContext = next; }),
}));
jest.mock('../operatorServer', () => ({ discoverOperator: jest.fn(), getActiveOperatorServer: jest.fn() }));
jest.mock('../supabaseConfig', () => ({
  getStoredToken: jest.fn(),
  initializeSupabase: jest.fn(),
  pairedSignIn: jest.fn(),
}));
jest.mock('@/store/operatorSwitch', () => ({ switchOperatorServer: jest.fn() }));
jest.mock('../pairingCrypto', () => {
  class PairingAnswerError extends Error { reason = 'bad'; }
  return { newPairingNonce: jest.fn(async () => 'nonce'), openPairingAnswer: jest.fn(), PairingAnswerError };
});
jest.mock('../facilityCapabilities', () => ({ setFacilityCapabilities: jest.fn() }));
jest.mock('../backendTooOld', () => ({ noteBackendRelease: jest.fn() }));

const payload = { addr: 'http://192.168.1.50:18200', instanceId: 'inst-new', code: '123456', secret: 'secret' } as never;
const current = { canonical: 'https://current.example.test', lan: 'http://192.168.1.10:18200', instanceId: 'inst-old', localOnly: false };
const dispatch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockContext = current;
  (discoverOperator as jest.Mock).mockResolvedValue({
    server: { instanceId: 'inst-new', displayName: 'New Cold Store' },
    config: { supabaseUrl: 'u', anonKey: 'k', capabilities: {} },
  });
  (getActiveOperatorServer as jest.Mock).mockReturnValue({ instanceId: 'inst-old', displayName: 'Old Cold Store' });
  (getStoredToken as jest.Mock).mockResolvedValue({ authToken: 'token' });
  (global as { fetch: unknown }).fetch = jest.fn(async () => ({ status: 200, ok: true, json: async () => ({ success: true, data: {} }) }));
  (openPairingAnswer as jest.Mock).mockResolvedValue({});
  (switchOperatorServer as jest.Mock).mockResolvedValue({ kind: 'switched' });
  (pairedSignIn as jest.Mock).mockResolvedValue({ success: true, userProfile: { id: 'u1' } });
});

it('keeps the current facility\'s context while the question waits (discovery used the new one)', async () => {
  const seen: unknown[] = [];
  let sawNewDuringDiscovery = false;
  (discoverOperator as jest.Mock).mockImplementationOnce(async () => {
    sawNewDuringDiscovery = (getLanContext() as { instanceId: string }).instanceId === 'inst-new';
    return { server: { instanceId: 'inst-new', displayName: 'New Cold Store' }, config: { supabaseUrl: 'u', anonKey: 'k', capabilities: {} } };
  });
  await pairWithFacility(payload, dispatch, async () => { seen.push(getLanContext()); return false; });
  expect(sawNewDuringDiscovery).toBe(true);
  expect(seen).toEqual([current]);
});

it('Cancel changes nothing: the old context is still set, nothing is redeemed', async () => {
  const result = await pairWithFacility(payload, dispatch, async () => false);
  expect(result).toEqual({ ok: false, reason: 'cancelled' });
  expect(getLanContext()).toBe(current);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(switchOperatorServer).not.toHaveBeenCalled();
});

it('Yes sets the new local-only context again before the code is redeemed', async () => {
  let atRedeem: unknown;
  (global.fetch as jest.Mock).mockImplementationOnce(async () => {
    atRedeem = getLanContext();
    return { status: 200, ok: true, json: async () => ({ success: true, data: {} }) };
  });
  const result = await pairWithFacility(payload, dispatch, async () => true);
  expect(result).toEqual({ ok: true, userProfile: { id: 'u1' } });
  expect(atRedeem).toEqual(expect.objectContaining({ instanceId: 'inst-new', localOnly: true, lan: 'http://192.168.1.50:18200' }));
  expect(setLanContext).toHaveBeenCalled();
});

it('a switch that fails after Yes puts the old context back', async () => {
  (switchOperatorServer as jest.Mock).mockResolvedValue({ kind: 'failed' });
  const result = await pairWithFacility(payload, dispatch, async () => true);
  expect(result).toEqual({ ok: false, reason: 'failed' });
  expect(getLanContext()).toBe(current);
});
