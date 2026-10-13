/**
 * The facility's capabilities: read from its public config, kept per server, read for the
 * active server only, DEMO_CAPABILITIES where none are known.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  getFacilityCapabilities,
  hasCapability,
  normalizeCapabilities,
  resetFacilityCapabilities,
  setFacilityCapabilities,
  subscribeFacilityCapabilities,
  type FacilityCapabilities,
} from '../facilityCapabilities';
import { DEMO_CAPABILITIES } from '../demoCapabilities';
import { clearOperatorServer, loadOperatorServer, saveOperatorServer } from '../operatorServer';
import { verifySelectedOperator } from '../operatorBootstrap';
import { useCapability, useFacilityCapabilities } from '@/hooks/useCapability';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));

const NORTH = { origin: 'https://north-cold.example.test', instanceId: 'instance-north', displayName: 'North', companyName: 'North Cold Store' };
const SOUTH = { origin: 'https://south-cold.example.test', instanceId: 'instance-south', displayName: 'South', companyName: 'South Cold Store' };

beforeEach(async () => {
  resetFacilityCapabilities();
  await AsyncStorage.clear();
  await loadOperatorServer();
});

describe('normalizeCapabilities', () => {
  it('is the demo set for anything that is not an object', () => {
    for (const raw of [undefined, null, 'sensors', 1, true, [], [{ sensors: true }]])
      expect(normalizeCapabilities(raw)).toEqual(DEMO_CAPABILITIES);
  });

  it('takes each known key that is true or false', () => {
    expect(normalizeCapabilities({ printing: true, sensors: true, realtime: false, customerDocuments: true })).toEqual({
      printing: true,
      sensors: true,
      realtime: false,
      customerDocuments: true,
    });
  });

  it('keeps the demo default for a missing key, a value that is not a boolean, and drops unknown keys', () => {
    expect(normalizeCapabilities({ sensors: 'true', printing: 1, realtime: null, telegram: true })).toEqual(DEMO_CAPABILITIES);
    expect(normalizeCapabilities({ sensors: true })).toEqual({ ...DEMO_CAPABILITIES, sensors: true });
    expect(Object.keys(normalizeCapabilities({ telegram: true })).sort()).toEqual(
      ['customerDocuments', 'printing', 'realtime', 'sensors']
    );
  });

  it('never hands out the demo object itself', () => {
    const result = normalizeCapabilities({});
    result.sensors = true;
    expect(DEMO_CAPABILITIES.sensors).toBe(false);
  });
});

describe('the store', () => {
  it('is the demo set with no active server, and for an active server whose config was not read', async () => {
    setFacilityCapabilities(NORTH, { sensors: true });
    expect(getFacilityCapabilities()).toBe(DEMO_CAPABILITIES);
    await saveOperatorServer(SOUTH, false);
    expect(getFacilityCapabilities()).toBe(DEMO_CAPABILITIES);
    expect(hasCapability('sensors')).toBe(false);
  });

  it("gives the active server's capabilities", async () => {
    await saveOperatorServer(NORTH, false);
    setFacilityCapabilities(NORTH, { sensors: true, printing: true });
    expect(getFacilityCapabilities()).toEqual({ ...DEMO_CAPABILITIES, sensors: true, printing: true });
    expect(hasCapability('sensors')).toBe(true);
    expect(hasCapability('customerDocuments')).toBe(false);
  });

  it('follows the active server: each keeps its own, and a server change never shows the previous one', async () => {
    setFacilityCapabilities(NORTH, { sensors: true });
    setFacilityCapabilities(SOUTH, { sensors: false, printing: true });
    await saveOperatorServer(NORTH, false);
    expect(hasCapability('sensors')).toBe(true);
    await saveOperatorServer(SOUTH, false);
    expect(hasCapability('sensors')).toBe(false);
    expect(hasCapability('printing')).toBe(true);
    await clearOperatorServer();
    expect(getFacilityCapabilities()).toBe(DEMO_CAPABILITIES);
  });

  it('a new instance at the same address does not inherit the old instance capabilities', async () => {
    setFacilityCapabilities(NORTH, { sensors: true });
    await saveOperatorServer({ ...NORTH, instanceId: 'instance-north-rebuilt' }, false);
    expect(getFacilityCapabilities()).toBe(DEMO_CAPABILITIES);
  });

  it('tells subscribers of a change, not of the same answer again', () => {
    const listener = jest.fn();
    const stop = subscribeFacilityCapabilities(listener);
    setFacilityCapabilities(NORTH, { sensors: true });
    expect(listener).toHaveBeenCalledTimes(1);
    setFacilityCapabilities(NORTH, { sensors: true, unknown: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    setFacilityCapabilities(NORTH, { sensors: false });
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    setFacilityCapabilities(NORTH, { sensors: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('the same answer again keeps the same object', async () => {
    await saveOperatorServer(NORTH, false);
    setFacilityCapabilities(NORTH, { sensors: true });
    const first = getFacilityCapabilities();
    setFacilityCapabilities(NORTH, { sensors: true });
    expect(getFacilityCapabilities()).toBe(first);
  });
});

describe('verifySelectedOperator', () => {
  const oldFetch = global.fetch;
  afterAll(() => {
    global.fetch = oldFetch;
  });
  const publicResponse = (capabilities: unknown) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          supabaseUrl: NORTH.origin,
          anonKey: `header.${btoa(JSON.stringify({ role: 'anon', exp: 9999999999 })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`,
          environment: 'production',
          version: '0.1.0',
          maintenanceMode: false,
          instanceId: NORTH.instanceId,
          displayName: NORTH.displayName,
          companyName: NORTH.companyName,
          canonicalOrigin: NORTH.origin,
          supportedApiVersions: ['1'],
          minimumClientVersion: '0.1.0',
          capabilities,
          urls: { publicConfig: `${NORTH.origin}/functions/v1/get-public-config`, fullConfig: `${NORTH.origin}/functions/v1/get-config` },
        },
      }),
    }) as Response;

  it("records the selected server's capabilities from every verification", async () => {
    await saveOperatorServer(NORTH, false);
    global.fetch = jest.fn().mockResolvedValue(publicResponse({ sensors: true }));
    expect((await verifySelectedOperator(() => true, jest.fn())).kind).toBe('verified');
    expect(hasCapability('sensors')).toBe(true);

    // The facility turned sensors off: the next verification (return to the foreground) says so.
    global.fetch = jest.fn().mockResolvedValue(publicResponse({ sensors: false }));
    expect((await verifySelectedOperator(() => true, jest.fn())).kind).toBe('verified');
    expect(hasCapability('sensors')).toBe(false);
  });
});

describe('useFacilityCapabilities', () => {
  let renderer: ReactTestRenderer | undefined;
  let seen: FacilityCapabilities[] = [];
  let sensors: boolean[] = [];
  function Probe() {
    seen.push(useFacilityCapabilities());
    sensors.push(useCapability('sensors'));
    return null;
  }
  beforeEach(async () => {
    seen = [];
    sensors = [];
    await act(async () => {
      renderer = create(React.createElement(Probe));
    });
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('renders again when the capabilities are recorded', async () => {
    await act(async () => saveOperatorServer(NORTH, false));
    expect(sensors.at(-1)).toBe(false);
    await act(async () => setFacilityCapabilities(NORTH, { sensors: true }));
    expect(sensors.at(-1)).toBe(true);
    expect(seen.at(-1)).toEqual({ ...DEMO_CAPABILITIES, sensors: true });
  });

  it('renders again when the active server changes', async () => {
    setFacilityCapabilities(NORTH, { sensors: true });
    setFacilityCapabilities(SOUTH, { sensors: false });
    await act(async () => saveOperatorServer(NORTH));
    expect(sensors.at(-1)).toBe(true);
    await act(async () => saveOperatorServer(SOUTH));
    expect(sensors.at(-1)).toBe(false);
  });
});
