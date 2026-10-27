import { backendHasFeature, getFacilityRelease, migrationNumber, resetFacilityRelease, setFacilityRelease } from '../backendFeatures';

let mockActive: { origin: string; instanceId: string } | null = null;
jest.mock('../operatorServer', () => ({ getActiveOperatorServer: () => mockActive }));
const one = { origin: 'https://one.example.test', instanceId: 'instance-0001' };
const two = { origin: 'https://two.example.test', instanceId: 'instance-0002' };

beforeEach(() => { resetFacilityRelease(); mockActive = one; });

it('reads the number a migration file name starts with', () => {
  expect(migrationNumber('00000000000126_sessions_and_source_limits')).toBe(126);
  expect(migrationNumber('00000000000000_baseline')).toBe(0);
  expect(migrationNumber('baseline')).toBeNull();
  expect(migrationNumber(null)).toBeNull();
});

it('is known per server and only for the active one', () => {
  setFacilityRelease(one, { backendRelease: 'v0.5.0', schemaHead: '00000000000120_a' });
  setFacilityRelease(two, { backendRelease: 'v0.5.0', schemaHead: '00000000000126_b' });
  expect(backendHasFeature('orderLineVersion')).toBe(false);
  mockActive = two;
  expect(backendHasFeature('orderLineVersion')).toBe(true);
});

it('the feature starts at its migration, not after it', () => {
  setFacilityRelease(one, { schemaHead: '00000000000121_review_decisions' });
  expect(backendHasFeature('orderLineVersion')).toBe(true);
});

it('keeps only plain names; anything else is "does not say", which counts as older', () => {
  setFacilityRelease(one, { backendRelease: 'x y; drop', schemaHead: 42 });
  expect(getFacilityRelease()).toEqual({ backendRelease: null, schemaHead: null });
  expect(backendHasFeature('orderLineVersion')).toBe(false);
});

it('a server nothing was recorded for counts as older, and a recorded current head as current', () => {
  expect(backendHasFeature('orderLineVersion')).toBe(false);
  setFacilityRelease(one, { backendRelease: 'v0.5.0', schemaHead: '00000000000126_sessions_and_source_limits' });
  expect(backendHasFeature('orderLineVersion')).toBe(true);
});

it('knows nothing when no server is selected', () => {
  mockActive = null;
  expect(getFacilityRelease()).toEqual({ backendRelease: null, schemaHead: null });
});
