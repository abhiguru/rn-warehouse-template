import { createOperatorResumeGate } from '../operatorResume';
const deferred = () => {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
test('background suspends synchronously and concurrent callers share public verification', async () => {
  const gate = createOperatorResumeGate();
  const result = deferred();
  const verify = jest.fn(() => result.promise);
  const stopped = jest.fn();
  gate.installVerifier(verify);
  gate.onSuspend(stopped);
  gate.suspend();
  expect(stopped).toHaveBeenCalledTimes(1);
  expect(gate.isVerified()).toBe(false);
  const first = gate.ensureVerified(),
    second = gate.ensureVerified();
  await Promise.resolve();
  expect(verify).toHaveBeenCalledTimes(1);
  result.resolve(true);
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(gate.isVerified()).toBe(true);
});
test('failed discovery keeps the gate closed and allows a later ordinary retry', async () => {
  const gate = createOperatorResumeGate();
  const verify = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(true);
  gate.installVerifier(verify);
  gate.suspend();
  await expect(gate.ensureVerified()).rejects.toThrow('offline');
  expect(gate.isVerified()).toBe(false);
  expect(await gate.ensureVerified()).toBe(true);
  expect(verify).toHaveBeenCalledTimes(2);
});
test('a second background invalidates in-flight discovery before it can release traffic', async () => {
  const gate = createOperatorResumeGate(),
    result = deferred();
  gate.installVerifier(() => result.promise);
  gate.suspend();
  const old = gate.ensureVerified();
  await Promise.resolve();
  gate.suspend();
  result.resolve(true);
  expect(await old).toBe(false);
  expect(gate.isVerified()).toBe(false);
});
test('missing or removed verification handlers cannot release suspended traffic', async () => {
  const gate = createOperatorResumeGate();
  gate.suspend();
  expect(await gate.ensureVerified()).toBe(false);
  const remove = gate.installVerifier(async () => true);
  remove();
  expect(await gate.ensureVerified()).toBe(false);
});
test('an unverified result does not open the gate or remove suspension listeners prematurely', async () => {
  const gate = createOperatorResumeGate();
  const stop = jest.fn();
  const remove = gate.onSuspend(stop);
  gate.installVerifier(async () => false);
  gate.suspend();
  expect(await gate.ensureVerified()).toBe(false);
  expect(gate.isVerified()).toBe(false);
  remove();
  gate.suspend();
  expect(stop).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// Resume lifecycle: when a transition suspends, when it defers, when it verifies
// ---------------------------------------------------------------------------
import { createResumeLifecycle, RESUME_HANDOFF_GRACE_MS } from '../resumeLifecycle';
import type { AppStateStatus } from 'react-native';

type Step = { state: AppStateStatus; handoff?: boolean; at?: number };
const GRACE = RESUME_HANDOFF_GRACE_MS;

function drive(steps: Step[]) {
  const gate = { suspend: jest.fn(), ensureVerified: jest.fn(async () => true) };
  let handoff = false;
  let clock = 0;
  const handler = createResumeLifecycle({ gate, isHandoffActive: () => handoff, now: () => clock });
  for (const step of steps) {
    if (step.handoff !== undefined) handoff = step.handoff;
    if (step.at !== undefined) clock = step.at;
    handler(step.state);
  }
  return gate;
}

test.each<[string, Step[], number, number]>([
  ['a plain background stay suspends once and verifies on return',
    [{ state: 'background' }, { state: 'active', at: 1000 }], 1, 1],
  ['an inactive blip (system dialog, app switcher) never suspends',
    [{ state: 'inactive' }, { state: 'active', at: 1000 }], 0, 1],
  ['repeated inactive blips never suspend',
    [{ state: 'inactive' }, { state: 'inactive' }, { state: 'active' }, { state: 'inactive' }, { state: 'active' }], 0, 2],
  ['a camera or picker round trip within the grace window does not suspend',
    [{ state: 'inactive', handoff: true }, { state: 'background' }, { state: 'active', at: 5 * 60 * 1000 }], 0, 1],
  ['a share sheet round trip within the grace window does not suspend',
    [{ state: 'background', handoff: true }, { state: 'inactive' }, { state: 'active', at: GRACE }], 0, 1],
  ['a multi-request mutation holding the switch gate defers suspension',
    [{ state: 'background', handoff: true }, { state: 'active', at: 30 * 1000 }], 0, 1],
  ['a hand-off that outlives the grace window suspends on return',
    [{ state: 'background', handoff: true }, { state: 'active', at: GRACE + 1 }], 1, 1],
  ['a second background without a hand-off suspends normally',
    [{ state: 'background', handoff: true }, { state: 'active', at: 1000, handoff: false }, { state: 'background' }, { state: 'active', at: 2000 }], 1, 2],
  ['a hand-off that ends while still backgrounded suspends on the next background only',
    [{ state: 'background', handoff: true }, { state: 'background', handoff: false }], 1, 0],
  ['the deferral clock starts at the first background and is not reset by repeats',
    [{ state: 'background', handoff: true }, { state: 'background', at: GRACE }, { state: 'active', at: GRACE + 1 }], 1, 1],
  ['staying active never suspends or verifies',
    [{ state: 'active' }, { state: 'active' }], 0, 0],
])('%s', (_, steps, suspends, verifications) => {
  const gate = drive(steps);
  expect(gate.suspend).toHaveBeenCalledTimes(suspends);
  expect(gate.ensureVerified).toHaveBeenCalledTimes(verifications);
});

test('a late return suspends before it verifies, so the verification covers the suspension', () => {
  const gate = drive([{ state: 'background', handoff: true }, { state: 'active', at: GRACE + 1 }]);
  expect(gate.suspend.mock.invocationCallOrder[0]).toBeLessThan(gate.ensureVerified.mock.invocationCallOrder[0]);
});

test('a failed foreground verification is contained and leaves the gate to retry', async () => {
  const gate = { suspend: jest.fn(), ensureVerified: jest.fn(async () => { throw new Error('offline'); }) };
  const handler = createResumeLifecycle({ gate, isHandoffActive: () => false });
  handler('background');
  expect(() => handler('active')).not.toThrow();
  await Promise.resolve();
  expect(gate.ensureVerified).toHaveBeenCalledTimes(1);
});

test('the lifecycle honours the AppState it started in', () => {
  const gate = { suspend: jest.fn(), ensureVerified: jest.fn(async () => true) };
  const handler = createResumeLifecycle({ gate, isHandoffActive: () => false, initialState: 'background' });
  handler('active');
  expect(gate.suspend).not.toHaveBeenCalled();
  expect(gate.ensureVerified).toHaveBeenCalledTimes(1);
});
