/**
 * The phone's Back key on the GRN items step, in a new GRN and in an edit
 * (owner decision of 2026-10-14): the route owns the key and asks the step,
 * which may first ask about an item that was not checkmarked. The route goes
 * back only when the step says so.
 *
 * What the step does with the question is in GrnItemsStepLeave.test.tsx; here
 * the step is a stand-in that registers a guard, or none.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import GRNFormStep2 from '../../../../../app/grn-form/step2';
import GRNEditStep2 from '../../../../../app/grn-edit/[id]/step2';

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

type Guard = (leave: () => void) => void;
type StandInProps = { mode: string; backGuard?: { current: Guard | null } };
/** The guard the stand-in step registers; null for a step that registers none. */
let mockGuard: jest.Mock<void, [() => void]> | null = null;
const mockStepProps: StandInProps[] = [];
jest.mock('@/features/grn/screens/GrnItemsStep', () => ({
  __esModule: true,
  default: (props: StandInProps) => {
    mockStepProps.push(props);
    require('react').useEffect(() => {
      const { backGuard } = props;
      if (!backGuard || !mockGuard) return undefined;
      backGuard.current = mockGuard;
      return () => { backGuard.current = null; };
    }, [props]);
    return null;
  },
}));

let back: ReturnType<typeof installHardwareBack>;
const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  mockGuard = null;
  mockStepProps.length = 0;
  back = installHardwareBack();
});
afterEach(async () => {
  for (const tree of mounted.splice(0)) {
    await act(async () => { tree.unmount(); });
  }
  back.restore();
});

async function mount(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(element); });
  mounted.push(tree);
  return tree;
}

/** Each route, the mode it gives the step, and where its Back key goes. */
const ROUTES = [
  ['new GRN', <GRNFormStep2 key="create" />, 'create', () => jest.mocked(router.dismissTo), ['/grn-form/step1']],
  ['edit GRN', <GRNEditStep2 key="edit" />, 'edit', () => jest.mocked(router.back), []],
] as const;
const navigations = () =>
  [router.dismissTo, router.back, router.replace, router.push].reduce((count, go) => count + jest.mocked(go).mock.calls.length, 0);

describe.each(ROUTES)('the Back key on the items step of a %s', (_name, screen, mode, goesBack, withArguments) => {
  it('gives the step its mode and a place for its guard', async () => {
    await mount(screen);

    expect(mockStepProps.at(-1)?.mode).toBe(mode);
    expect(mockStepProps.at(-1)?.backGuard).toEqual({ current: null });
  });

  it('asks the step, and goes nowhere while the step has not answered', async () => {
    mockGuard = jest.fn();
    await mount(screen);

    expect(back.press()).toBe(true);

    expect(mockGuard).toHaveBeenCalledTimes(1);
    expect(mockGuard).toHaveBeenCalledWith(expect.any(Function));
    expect(navigations()).toBe(0);
  });

  it('goes back when the step calls leave, and only then', async () => {
    mockGuard = jest.fn();
    await mount(screen);
    back.press();
    const leave = mockGuard.mock.calls[0][0];

    leave();

    expect(goesBack()).toHaveBeenCalledTimes(1);
    expect(goesBack()).toHaveBeenCalledWith(...withArguments);
    expect(navigations()).toBe(1);
  });

  it('goes back at once when no guard is registered', async () => {
    await mount(screen);

    expect(back.press()).toBe(true);

    expect(goesBack()).toHaveBeenCalledTimes(1);
    expect(goesBack()).toHaveBeenCalledWith(...withArguments);
    expect(navigations()).toBe(1);
  });

  it('keeps one listener, and takes it off when the step is left', async () => {
    const tree = await mount(screen);
    await act(async () => { tree.update(screen); });
    expect(back.count()).toBe(1);

    await act(async () => { tree.unmount(); });
    mounted.length = 0;

    expect(back.count()).toBe(0);
    expect(back.press()).toBe(false);
  });
});
