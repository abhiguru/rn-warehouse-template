/**
 * WH-306 (product/tech/app-offline-customer-accounts.md 7): the money-age strip looks at the phone's day every minute, and
 * that timer runs only for a customer account whose copy is usable (feature on, copy loaded). Staff, and a customer with no
 * copy, run none; the timer is cleared on unmount.
 *
 * Real: `useCustomerAge` and `customerAge`. Faked at the edge: the role in the store, the copy's status snapshot, the
 * connection, and the timers (the pending timers are counted).
 */
import { renderHook } from '@testing-library/react-native';
import { useCustomerAge } from '../useCustomerAge';

let mockRole: string | undefined;
let mockSnapshot: Record<string, unknown>;
let setIntervalSpy: jest.SpiedFunction<typeof setInterval>;
let clearIntervalSpy: jest.SpiedFunction<typeof clearInterval>;
// The strip's own timer is the one-minute interval; React and the test renderer keep timers of their own.
const dayTimers = () => setIntervalSpy.mock.calls.filter(call => call[1] === 60_000).length;
jest.mock('@/store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ auth: { userProfile: mockRole ? { role: mockRole } : null } }),
}));
jest.mock('@/hooks/usePhoneCopyStatus', () => ({ usePhoneCopyStatus: () => mockSnapshot }));
jest.mock('../useCopyOffline', () => ({ useCopyOffline: () => false }));

const ASOF = '2026-11-27T03:35:00.000Z';
const loaded = { feature: 'on', phase: 'ready', asOf: ASOF, current: true, running: null };

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-27T05:30:00.000Z') });
  mockRole = 'customer';
  mockSnapshot = { ...loaded };
  setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
  clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

describe('useCustomerAge timer', () => {
  it('a customer account with a loaded copy: one timer, and a strip state', async () => {
    const view = await renderHook(() => useCustomerAge());
    expect(view.result.current).toMatchObject({ asOf: Date.parse(ASOF) });
    expect(dayTimers()).toBe(1);
  });

  it('clears the timer when the screen goes', async () => {
    const view = await renderHook(() => useCustomerAge());
    expect(dayTimers()).toBe(1);
    await view.unmount();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it.each(['staff', 'supervisor', 'admin'])('%s: no timer and no strip', async role => {
    mockRole = role;
    const view = await renderHook(() => useCustomerAge());
    expect(view.result.current).toBeNull();
    expect(dayTimers()).toBe(0);
  });

  it.each([
    ['the feature off', { ...loaded, feature: 'off' }],
    ['no copy loaded yet', { ...loaded, asOf: null, phase: 'empty' }],
  ])('a customer account with %s: no timer and no strip', async (_name, snapshot) => {
    mockSnapshot = snapshot;
    const view = await renderHook(() => useCustomerAge());
    expect(view.result.current).toBeNull();
    expect(dayTimers()).toBe(0);
  });
});
