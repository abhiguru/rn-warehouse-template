/**
 * The backend floor (MIN_BACKEND_MIGRATION): a backend that says its newest migration is below it is told apart from
 * one that does not say, which is never blocked; the state follows the ACTIVE server only.
 */
import { MIN_BACKEND_MIGRATION, backendBelowFloor, resetFacilityRelease } from '../backendFeatures';
import { clearBackendTooOld, getBackendTooOld, noteBackendRelease, subscribeBackendTooOld } from '../backendTooOld';

let mockActive: { origin: string; instanceId: string } | null = null;
jest.mock('../operatorServer', () => ({ getActiveOperatorServer: () => mockActive }));
const one = { origin: 'https://one.example.test', instanceId: 'instance-0001' };
const two = { origin: 'https://two.example.test', instanceId: 'instance-0002' };

beforeEach(() => {
  resetFacilityRelease();
  clearBackendTooOld();
  mockActive = one;
});

it('the floor is migration 127', () => {
  expect(MIN_BACKEND_MIGRATION).toBe(127);
});

describe('backendBelowFloor', () => {
  it('is the migration number of a backend below 127, and null at 127 and above', () => {
    expect(backendBelowFloor('00000000000126_sessions_and_source_limits')).toBe(126);
    expect(backendBelowFloor('00000000000000_baseline')).toBe(0);
    expect(backendBelowFloor('00000000000127_document_numbering')).toBeNull();
    expect(backendBelowFloor('00000000000140_session_devices')).toBeNull();
  });

  it('never blocks a backend that does not say', () => {
    expect(backendBelowFloor(null)).toBeNull();
    expect(backendBelowFloor(undefined)).toBeNull();
    expect(backendBelowFloor('baseline')).toBeNull();
  });
});

describe('the screen\'s state', () => {
  it('is set by the active server\'s config when it is below the floor, and cleared by a current one', () => {
    noteBackendRelease(one, { schemaHead: '00000000000120_a' });
    expect(getBackendTooOld()).toEqual({ migration: 120, minimum: 127 });
    noteBackendRelease(one, { schemaHead: '00000000000130_b' });
    expect(getBackendTooOld()).toBeNull();
  });

  it('is not set by a missing schemaHead', () => {
    noteBackendRelease(one, { backendRelease: 'v0.4.0' });
    expect(getBackendTooOld()).toBeNull();
  });

  it('is not set by the config of a server that is not the active one', () => {
    noteBackendRelease(two, { schemaHead: '00000000000100_old' });
    expect(getBackendTooOld()).toBeNull();
  });

  it('tells its listeners once per change, not for the same answer again', () => {
    const listener = jest.fn();
    const stop = subscribeBackendTooOld(listener);
    noteBackendRelease(one, { schemaHead: '00000000000120_a' });
    noteBackendRelease(one, { schemaHead: '00000000000120_a' });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });
});
