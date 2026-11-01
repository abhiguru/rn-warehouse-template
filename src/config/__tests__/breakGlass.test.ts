/** Choosing a facility for a code from the facility: the list, and the warehouse-network address it is reached by. */
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockDispatch = jest.fn();
jest.mock('@/store', () => ({ store: { dispatch: (...a: unknown[]) => mockDispatch(...a), getState: () => ({ auth: {} }) } }));
jest.mock('@/store/operatorSwitch', () => ({
  switchOperatorServer: jest.fn(async () => ({ kind: 'switched' })),
  retryStaleFacilityCleanup: jest.fn(async () => true),
}));
jest.mock('../supabaseConfig', () => ({ initializeSupabase: jest.fn() }));
jest.mock('../staleFacilitySession', () => ({ isStaleFacility: jest.fn(async () => false) }));
jest.mock('../facilityCapabilities', () => ({ setFacilityCapabilities: jest.fn() }));
jest.mock('../backendFeatures', () => ({ setFacilityRelease: jest.fn() }));
jest.mock('../operatorServer', () => ({
  discoverOperator: jest.fn(),
  getActiveOperatorServer: jest.fn(() => null),
  recordServerLanAddress: jest.fn(async () => {}),
}));

import { listFacilitiesForCode, prepareFacilityForCode } from '../breakGlass';
import { addMyFacility, CENTRAL_FACILITIES_PREFIX } from '../centralFacilities';
import { rememberFacilityLan } from '../facilityLanMemory';
import { getLanContext, resetLanTransport } from '../lanTransport';
import { discoverOperator, recordServerLanAddress } from '../operatorServer';
import { switchOperatorServer } from '@/store/operatorSwitch';
import { resetCentralStateForTests } from '../centralState';

const NORTH = 'https://north-cold.example.test';
const SERVER = { origin: NORTH, instanceId: 'inst-1', displayName: 'North', companyName: 'North Cold Storage' };
const facility = (origin = NORTH, name = 'North Cold Storage') =>
  ({ origin, instanceId: 'inst-1', name, city: 'Rajkot', status: 'approved', lastOpenedAt: null, addedAt: '', source: null, gone: false }) as const;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetLanTransport();
  resetCentralStateForTests();
  jest.mocked(discoverOperator).mockResolvedValue({ server: SERVER, config: { supabaseUrl: 'u', anonKey: 'k' } } as never);
});

describe('the facilities offered', () => {
  it('are those on any person\'s list on the phone, once each, without the ones the association dropped', async () => {
    await addMyFacility('asha', { origin: NORTH, name: 'North Cold Storage' });
    await addMyFacility('ravi', { origin: NORTH, name: 'North Cold Storage' });
    await addMyFacility('ravi', { origin: 'https://south.example.test', name: 'South Cold' });
    expect((await listFacilitiesForCode()).map(entry => entry.origin).sort()).toEqual([NORTH, 'https://south.example.test']);
    expect(CENTRAL_FACILITIES_PREFIX).toBeTruthy();
  });

  it('are none on a phone with no list', async () => {
    expect(await listFacilitiesForCode()).toEqual([]);
  });
});

describe('preparing a facility', () => {
  it('discovers it over the remembered LAN address, selects it and restores the address on the selected server', async () => {
    await rememberFacilityLan(NORTH, 'inst-1', 'http://192.168.1.20:8080');
    let during: ReturnType<typeof getLanContext> = null;
    jest.mocked(discoverOperator).mockImplementation(async () => {
      during = getLanContext();
      return { server: SERVER, config: { supabaseUrl: 'u', anonKey: 'k' } } as never;
    });
    expect(await prepareFacilityForCode(facility())).toEqual({ ok: true });
    expect(during).toEqual({ canonical: NORTH, lan: 'http://192.168.1.20:8080', instanceId: 'inst-1' });
    expect(switchOperatorServer).toHaveBeenCalledWith(SERVER, expect.anything());
    expect(recordServerLanAddress).toHaveBeenCalledWith(NORTH, 'http://192.168.1.20:8080');
  });

  it('puts the transport back when the facility cannot be reached', async () => {
    await rememberFacilityLan(NORTH, 'inst-1', 'http://192.168.1.20:8080');
    jest.mocked(discoverOperator).mockRejectedValue(new Error('down'));
    const result = await prepareFacilityForCode(facility());
    expect(result).toMatchObject({ ok: false });
    expect(switchOperatorServer).not.toHaveBeenCalled();
    expect(getLanContext()).toBeNull();
  });

  it('uses no LAN address for a facility that never offered one', async () => {
    expect(await prepareFacilityForCode(facility())).toEqual({ ok: true });
    expect(recordServerLanAddress).not.toHaveBeenCalled();
  });

  it('says so when a switch is busy', async () => {
    jest.mocked(switchOperatorServer).mockResolvedValueOnce({ kind: 'busy' });
    expect(await prepareFacilityForCode(facility())).toMatchObject({ ok: false });
  });
});
