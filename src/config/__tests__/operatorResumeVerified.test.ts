/**
 * WH-298 phone finding S5: the identity gate tells whoever asked when it OPENS. A gate that was shut (`suspend()`) and
 * verifies once the server answers must let a listener know exactly once, on the first true verification only: never on a
 * false answer (the server did not answer or refused), and never for a verification of an older epoch.
 *
 * Real: `createOperatorResumeGate`. The verifier is the gate's one input (the server's answer).
 *
 * ===== AGREE WITH DEVELOPMENT (WH-298 phone S5) =====
 *  - OPEN CHOICE, the name: `onVerified(listener): () => void` as Development planned (it does not exist on 6691a419, so
 *    these cases fail there with "gate.onVerified is not a function"). The listener gets no arguments here; an
 *    unsubscribe function is returned and stops further calls.
 * =====================================================
 */
import { createOperatorResumeGate } from '../operatorResume';

type Gate = ReturnType<typeof createOperatorResumeGate> & { onVerified: (listener: () => void) => () => void };
const makeGate = () => createOperatorResumeGate() as Gate;

describe('the identity gate tells when it opens', () => {
  it('fires once, on the true answer only, not on a false one', async () => {
    const gate = makeGate();
    const answers = [false, true];
    gate.installVerifier(async () => answers.shift() ?? true);
    const opened = jest.fn();
    gate.suspend();
    gate.onVerified(opened);
    expect(await gate.ensureVerified()).toBe(false);
    expect(opened).not.toHaveBeenCalled();
    expect(await gate.ensureVerified()).toBe(true);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(await gate.ensureVerified()).toBe(true); // already open: nothing more to announce
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('never fires for a verification of an older epoch (the gate was suspended again meanwhile)', async () => {
    const gate = makeGate();
    let release!: (value: boolean) => void;
    gate.installVerifier(() => new Promise<boolean>(resolve => { release = resolve; }));
    const opened = jest.fn();
    gate.suspend();
    gate.onVerified(opened);
    const stale = gate.ensureVerified();
    await Promise.resolve();
    gate.suspend();
    release(true);
    expect(await stale).toBe(false);
    expect(opened).not.toHaveBeenCalled();
    expect(gate.isVerified()).toBe(false);
  });

  it('an unsubscribed listener is not called', async () => {
    const gate = makeGate();
    gate.installVerifier(async () => true);
    const opened = jest.fn();
    gate.suspend();
    gate.onVerified(opened)();
    expect(await gate.ensureVerified()).toBe(true);
    expect(opened).not.toHaveBeenCalled();
  });
});
