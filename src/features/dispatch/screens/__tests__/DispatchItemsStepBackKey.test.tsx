/**
 * The phone's Back key on step 2 of the dispatch form, in both of its routes
 * (app/dispatch-form/step2.tsx and app/dispatch-edit/[id]/step2.tsx).
 *
 * The route owns the key. The step hands it a way back through the `backGuard`
 * ref: the one its footer's Back takes, which asks "Go back to details?" when
 * items would be left behind (DispatchItemsStepLeave.test.tsx has the step's
 * side). Here the step is a stand-in, so only the routes are under test: Back
 * runs the guard that is registered, and without one each route does what it
 * did before it had a guard.
 */
import React from 'react';
import type { MutableRefObject } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { showAlert } from '@/utils/alert';
import DispatchFormStep2 from '../../../../../app/dispatch-form/step2';
import DispatchEditStep2 from '../../../../../app/dispatch-edit/[id]/step2';

type StepProps = { mode: 'create' | 'edit'; backGuard?: MutableRefObject<(() => void) | null> };

jest.mock('expo-router', () => {
  const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    router: mockRouter,
    useRouter: () => mockRouter,
    // The screen is in focus for as long as it is mounted.
    useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
  };
});
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
// The step is a stand-in that keeps what the route gave it.
let mockStepProps: StepProps | null = null;
jest.mock('@/features/dispatch/screens', () => ({
  DispatchItemsStep: (props: StepProps) => {
    mockStepProps = props;
    return null;
  },
}));

let back: ReturnType<typeof installHardwareBack>;
let tree: ReactTestRenderer;
const mount = async (element: React.ReactElement) => {
  await act(async () => { tree = create(element); });
};
/** What the step does when it is mounted: puts its way back in the route's ref. */
const register = (guard: (() => void) | null) => {
  mockStepProps!.backGuard!.current = guard;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStepProps = null;
  back = installHardwareBack();
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  back.restore();
});

describe.each([
  ['a new dispatch', 'create', <DispatchFormStep2 key="create" />],
  ['an edited dispatch', 'edit', <DispatchEditStep2 key="edit" />],
] as const)('step 2 of %s', (_name, mode, route) => {
  it('gives the step its mode and a place for its way back', async () => {
    await mount(route);

    expect(mockStepProps!.mode).toBe(mode);
    expect(mockStepProps!.backGuard).toEqual({ current: null });
    expect(back.count()).toBe(1);
  });

  it('Back runs the way back the step registered, and nothing else', async () => {
    const guard = jest.fn();
    await mount(route);
    register(guard);

    expect(back.press()).toBe(true);

    expect(guard).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('Back runs the way back registered last, through the one listener the route added', async () => {
    const first = jest.fn();
    const second = jest.fn();
    await mount(route);
    register(first);
    back.press();
    // The step draws itself again and registers its way back anew; so does the route.
    register(second);
    await act(async () => { tree.update(route); });

    expect(back.press()).toBe(true);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(back.count()).toBe(1);
  });

  it('stops listening when the route is left', async () => {
    const guard = jest.fn();
    await mount(route);
    register(guard);

    await act(async () => { tree.unmount(); });

    expect(back.count()).toBe(0);
    expect(back.press()).toBe(false);
    expect(guard).not.toHaveBeenCalled();
  });
});

describe('Back with no way back registered', () => {
  it('a new dispatch: goes to the step 1 already in the stack, without a question, as before', async () => {
    await mount(<DispatchFormStep2 />);

    expect(back.press()).toBe(true);

    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/dispatch-form/step1');
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('a new dispatch: the same again once the step has taken its way back away', async () => {
    const guard = jest.fn();
    await mount(<DispatchFormStep2 />);
    register(guard);
    register(null);

    expect(back.press()).toBe(true);

    expect(guard).not.toHaveBeenCalled();
    expect(router.dismissTo).toHaveBeenCalledWith('/dispatch-form/step1');
  });

  it('an edited dispatch: the key is left to the system, as before', async () => {
    await mount(<DispatchEditStep2 />);

    expect(back.press()).toBe(false);

    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });
});
