/**
 * The on-disk list of facilities whose session may still be on the phone for an earlier
 * central sign-in (src/config/staleFacilitySession.ts; ops review 2026-10-17, M08).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearStaleFacility,
  isStaleFacility,
  loadStaleFacilities,
  markStaleFacility,
  STALE_FACILITY_KEY,
} from '../staleFacilitySession';

const NORTH = { origin: 'https://north-cold.example.test', instanceId: 'instance-north' };
const SOUTH = { origin: 'https://south-cold.example.test', instanceId: 'instance-south' };

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

it('keeps the origin and instance only, once per facility, and survives a reload from disk', async () => {
  await markStaleFacility({ ...NORTH, displayName: 'North', companyName: 'North Cold Store' } as typeof NORTH);
  await markStaleFacility(NORTH);
  expect(JSON.parse((await AsyncStorage.getItem(STALE_FACILITY_KEY))!)).toEqual([NORTH]);
  expect(await isStaleFacility(NORTH.origin)).toBe(true);
  expect(await isStaleFacility(NORTH.origin, NORTH.instanceId)).toBe(true);
  expect(await isStaleFacility(NORTH.origin, 'instance-north-new')).toBe(false);
  expect(await isStaleFacility(SOUTH.origin)).toBe(false);
});

it('two marks at the same moment both stay (the writes do not overwrite each other)', async () => {
  await Promise.all([markStaleFacility(NORTH), markStaleFacility(SOUTH)]);
  expect(await loadStaleFacilities()).toEqual([NORTH, SOUTH]);
});

it('clearing one leaves the other; clearing the last removes the key', async () => {
  await markStaleFacility(NORTH);
  await markStaleFacility(SOUTH);
  expect(await clearStaleFacility(NORTH)).toBe(true);
  expect(await loadStaleFacilities()).toEqual([SOUTH]);
  expect(await clearStaleFacility(SOUTH)).toBe(true);
  expect(await AsyncStorage.getItem(STALE_FACILITY_KEY)).toBeNull();
  expect(await clearStaleFacility(SOUTH)).toBe(true);
});

it('an unreadable or damaged list counts as empty; a failed write is reported', async () => {
  await AsyncStorage.setItem(STALE_FACILITY_KEY, '{not json');
  expect(await loadStaleFacilities()).toEqual([]);
  await AsyncStorage.setItem(STALE_FACILITY_KEY, JSON.stringify([{ origin: 1 }, NORTH, null]));
  expect(await loadStaleFacilities()).toEqual([NORTH]);
  jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));
  expect(await loadStaleFacilities()).toEqual([]);
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
  await expect(markStaleFacility(SOUTH)).rejects.toThrow('disk full');
  jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('disk full'));
  expect(await clearStaleFacility(NORTH)).toBe(false);
  expect(await loadStaleFacilities()).toEqual([NORTH]);
});
