/** "My facilities": the device-local list of one central person (src/config/centralFacilities.ts). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addMyFacility,
  CENTRAL_FACILITIES_PREFIX,
  deleteMyFacilities,
  loadMyFacilities,
  noteFacilitySmsSignIn,
  onMyFacilitiesChange,
  removeMyFacility,
  soleApprovedFacility,
  sortMyFacilities,
  updateMyFacility,
  type MyFacility,
} from '../centralFacilities';
import { resetCentralStateForTests, setCentralState, getCentralState } from '../centralState';

let mockCentralOn = true;
jest.mock('../envConfig', () => ({ isCentralLoginConfigured: () => mockCentralOn }));
let mockServer: { origin: string } | null = null;
jest.mock('../operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));

const NORTH = { origin: 'https://north-cold.example.test', name: 'North Cold Store', city: 'Rajkot' };
const SOUTH = { origin: 'https://south-cold.example.test', name: 'South Cold Store', city: 'Gondal' };
const EAST = { origin: 'https://east-cold.example.test', name: 'East Cold Store', city: 'Morbi' };

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers({ now: new Date('2026-10-12T06:00:00Z'), doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'setTimeout', 'clearTimeout'] });
  mockCentralOn = true;
  mockServer = null;
  resetCentralStateForTests();
});
afterEach(() => jest.useRealTimers());

const at = (iso: string) => jest.setSystemTime(new Date(iso));
const stored = async (userId: string) => JSON.parse((await AsyncStorage.getItem(`${CENTRAL_FACILITIES_PREFIX}${userId}`)) ?? 'null');

it('keeps one list per central person under central_facilities_v1:<id>', async () => {
  await addMyFacility('asha', NORTH);
  await addMyFacility('bhavin', SOUTH);
  expect((await loadMyFacilities('asha')).map(entry => entry.origin)).toEqual([NORTH.origin]);
  expect((await loadMyFacilities('bhavin')).map(entry => entry.origin)).toEqual([SOUTH.origin]);
  expect(await loadMyFacilities('nobody')).toEqual([]);
  expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual(['central_facilities_v1:asha', 'central_facilities_v1:bhavin']);
});

it('stores the address, instance, name, city, status and last opening, and no token', async () => {
  await addMyFacility('asha', NORTH);
  await updateMyFacility('asha', NORTH.origin, { status: 'approved', opened: true, instanceId: 'instance-north' });
  expect(await stored('asha')).toEqual([
    {
      origin: NORTH.origin,
      instanceId: 'instance-north',
      name: 'North Cold Store',
      city: 'Rajkot',
      status: 'approved',
      lastOpenedAt: '2026-10-12T06:00:00.000Z',
      addedAt: '2026-10-12T06:00:00.000Z',
    },
  ]);
  expect(JSON.stringify(await stored('asha'))).not.toMatch(/token|secret/i);
});

it('a facility that was added and never opened starts as unavailable', async () => {
  await addMyFacility('asha', NORTH);
  expect(await loadMyFacilities('asha')).toMatchObject([{ status: 'unavailable', lastOpenedAt: null, instanceId: null }]);
});

it('adding a facility twice keeps one entry and its status', async () => {
  await addMyFacility('asha', NORTH);
  await updateMyFacility('asha', NORTH.origin, { status: 'requested', opened: true });
  await addMyFacility('asha', { ...NORTH, name: 'North Cold Store (new name)' });
  expect(await loadMyFacilities('asha')).toMatchObject([{ name: 'North Cold Store (new name)', status: 'requested' }]);
});

it('shows the newest-opened first, then the ones never opened', async () => {
  at('2026-10-12T06:00:00Z');
  await addMyFacility('asha', NORTH);
  at('2026-10-12T06:01:00Z');
  await addMyFacility('asha', SOUTH);
  at('2026-10-12T06:02:00Z');
  await addMyFacility('asha', EAST);
  // Never opened: newest-added first.
  expect((await loadMyFacilities('asha')).map(entry => entry.name)).toEqual(['East Cold Store', 'South Cold Store', 'North Cold Store']);
  at('2026-10-12T07:00:00Z');
  await updateMyFacility('asha', NORTH.origin, { status: 'approved', opened: true });
  expect((await loadMyFacilities('asha')).map(entry => entry.name)).toEqual(['North Cold Store', 'East Cold Store', 'South Cold Store']);
  at('2026-10-12T08:00:00Z');
  await updateMyFacility('asha', SOUTH.origin, { status: 'requested', opened: true });
  expect((await loadMyFacilities('asha')).map(entry => entry.name)).toEqual(['South Cold Store', 'North Cold Store', 'East Cold Store']);
  // A status alone does not move a facility.
  await updateMyFacility('asha', EAST.origin, { status: 'revoked' });
  expect((await loadMyFacilities('asha')).map(entry => entry.name)).toEqual(['South Cold Store', 'North Cold Store', 'East Cold Store']);
});

it('sorts without changing the list it was given', () => {
  const list = [
    { ...NORTH, instanceId: null, status: 'approved', lastOpenedAt: '2026-10-01T00:00:00.000Z', addedAt: 'a' },
    { ...SOUTH, instanceId: null, status: 'approved', lastOpenedAt: '2026-10-02T00:00:00.000Z', addedAt: 'a' },
  ] as MyFacility[];
  expect(sortMyFacilities(list).map(entry => entry.name)).toEqual(['South Cold Store', 'North Cold Store']);
  expect(list[0].name).toBe('North Cold Store');
});

it('does not add a facility through a status update', async () => {
  await updateMyFacility('asha', NORTH.origin, { status: 'approved', opened: true });
  expect(await loadMyFacilities('asha')).toEqual([]);
});

it('removes one facility, and the whole list on account deletion, for that person only', async () => {
  await addMyFacility('asha', NORTH);
  await addMyFacility('asha', SOUTH);
  await addMyFacility('bhavin', NORTH);
  await removeMyFacility('asha', NORTH.origin);
  expect((await loadMyFacilities('asha')).map(entry => entry.origin)).toEqual([SOUTH.origin]);
  await deleteMyFacilities('asha');
  expect(await AsyncStorage.getItem('central_facilities_v1:asha')).toBeNull();
  expect(await loadMyFacilities('asha')).toEqual([]);
  expect((await loadMyFacilities('bhavin')).map(entry => entry.origin)).toEqual([NORTH.origin]);
});

it('tells listeners about every change', async () => {
  const listener = jest.fn();
  const stop = onMyFacilitiesChange(listener);
  await addMyFacility('asha', NORTH);
  await updateMyFacility('asha', NORTH.origin, { status: 'approved' });
  await deleteMyFacilities('asha');
  expect(listener).toHaveBeenCalledTimes(3);
  stop();
  await addMyFacility('asha', NORTH);
  expect(listener).toHaveBeenCalledTimes(3);
});

it('reads a damaged list as empty and drops entries it cannot use', async () => {
  await AsyncStorage.setItem('central_facilities_v1:asha', 'not json');
  expect(await loadMyFacilities('asha')).toEqual([]);
  await AsyncStorage.setItem(
    'central_facilities_v1:asha',
    JSON.stringify([{ origin: 'http://plain.example.test', name: 'Plain' }, { origin: NORTH.origin }, { ...NORTH, status: 'made-up' }, { ...NORTH }])
  );
  expect(await loadMyFacilities('asha')).toMatchObject([{ origin: NORTH.origin, status: 'unavailable' }]);
});

describe('skipping the list', () => {
  const entry = (name: string, status: MyFacility['status']) =>
    ({ origin: `https://${name}.example.test`, instanceId: null, name, city: '', status, lastOpenedAt: null, addedAt: '' }) as MyFacility;

  it.each([
    ['exactly one approved facility', [entry('a', 'approved')], 'a'],
    ['one approved and one revoked', [entry('a', 'approved'), entry('b', 'revoked')], 'a'],
    ['one approved and one unavailable', [entry('a', 'approved'), entry('b', 'unavailable')], 'a'],
    ['two approved', [entry('a', 'approved'), entry('b', 'approved')], null],
    ['one approved and a request waiting', [entry('a', 'approved'), entry('b', 'requested')], null],
    ['one approved and one asking for its own code', [entry('a', 'approved'), entry('b', 'link_needed')], null],
    ['only one asking for its own code', [entry('a', 'link_needed')], 'a'],
    ['one asking for its own code and one revoked', [entry('a', 'link_needed'), entry('b', 'revoked')], 'a'],
    ['two asking for their own code', [entry('a', 'link_needed'), entry('b', 'link_needed')], null],
    ['only a request', [entry('b', 'requested')], null],
    ['nothing', [], null],
  ])('%s', (_name, list, expected) => {
    expect(soleApprovedFacility(list)?.name ?? null).toBe(expected);
  });
});

describe("a facility's own SMS sign-in while central login is on", () => {
  beforeEach(async () => {
    setCentralState({ status: 'signedIn', user: { id: 'asha', phoneNumber: '919000000001', name: null, createdAt: '' }, facilitySmsOrigin: NORTH.origin });
    mockServer = { origin: NORTH.origin };
    await addMyFacility('asha', NORTH);
  });

  it('records the facility as approved and ends the SMS sign-in', async () => {
    await noteFacilitySmsSignIn('approved');
    expect(await loadMyFacilities('asha')).toMatchObject([{ status: 'approved', lastOpenedAt: '2026-10-12T06:00:00.000Z' }]);
    expect(getCentralState().facilitySmsOrigin).toBeNull();
  });

  it('records a request that waits and ends the SMS sign-in too: the way on is My facilities', async () => {
    await noteFacilitySmsSignIn('requested');
    expect(await loadMyFacilities('asha')).toMatchObject([{ status: 'requested' }]);
    expect(getCentralState().facilitySmsOrigin).toBeNull();
  });

  it('does nothing without central login', async () => {
    mockCentralOn = false;
    await noteFacilitySmsSignIn('approved');
    expect(await loadMyFacilities('asha')).toMatchObject([{ status: 'unavailable' }]);
  });
});
