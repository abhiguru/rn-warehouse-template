/**
 * useLeaveGuard: ask before unsaved work is left, only when something changed,
 * on every way out (house rule of 2026-10-14, G-05).
 *
 * The real expo-router stack runs here (the in-memory route context of
 * expo-router's own testing library): screen A ("/") opens screen B ("/b"),
 * and B calls useLeaveGuard. The header Back calls `router.back()`, the Android
 * Back key reaches the navigation container's own Back listener, and the iOS
 * swipe and the native header Back dispatch a POP; each is tried here.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store as routerStore } from 'expo-router/build/global-state/router-store';
import { router, Stack } from 'expo-router';
import { StackActions } from 'expo-router/react-navigation';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { showAlert } from '@/utils/alert';
import { useLeaveGuard, type LeaveGuardOptions } from '../useLeaveGuard';

jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

type ButtonList = { text?: string; style?: string; onPress?: () => void }[];

/** What screen B passes to the hook, set by each test before B opens. */
let options: LeaveGuardOptions = { hasChanges: false };
/** B's leaveWithoutAsking, as the hook returned it. */
let leaveWithoutAsking: (go: () => void) => void = () => undefined;

function ScreenA() {
  return <Text>Screen A</Text>;
}
function ScreenB() {
  ({ leaveWithoutAsking } = useLeaveGuard(options));
  return <Text>Screen B</Text>;
}

let tree: ReactTestRenderer;
let backKey: ReturnType<typeof installHardwareBack>;

const settle = async () => {
  await act(async () => { await jest.runAllTimersAsync(); });
};
const pathname = () => routerStore.getRouteInfo().pathname;
/** The screens in the app's stack, bottom first. */
const routeNames = () => (routerStore.state?.routes[0]?.state?.routes ?? []).map(route => route.name);
const lastAlert = () => {
  const calls = jest.mocked(showAlert).mock.calls;
  const [title, message, buttons, alertOptions] = calls[calls.length - 1];
  return { title, message, buttons: (buttons ?? []) as ButtonList, options: alertOptions };
};
const press = async (label: string) => {
  const button = lastAlert().buttons.find(b => b.text === label);
  if (!button) throw new Error(`No button ${label}`);
  await act(async () => { button.onPress?.(); });
  await settle();
};
const openB = async (next: LeaveGuardOptions) => {
  options = next;
  await act(async () => { router.push('/b'); });
  await settle();
  expect(pathname()).toBe('/b');
};
const setChanges = async (hasChanges: boolean) => {
  options = { ...options, hasChanges };
  // B draws itself again with the new value, as a form does when it is typed into.
  await act(async () => { router.setParams({ edit: String(Date.now()) }); });
  await settle();
};

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  options = { hasChanges: false };
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  backKey = installHardwareBack();
  const context = getMockContext({
    _layout: () => <Stack screenOptions={{ headerShown: false }} />,
    index: ScreenA,
    b: ScreenB,
  });
  await act(async () => {
    tree = create(<ExpoRoot context={context} location="/" />);
  });
  await settle();
});

afterEach(async () => {
  await act(async () => { tree.unmount(); });
  backKey.restore();
  jest.useRealTimers();
});

describe('nothing changed', () => {
  it('header Back (router.back) leaves at once without a question', async () => {
    await openB({ hasChanges: false });

    await act(async () => { router.back(); });
    await settle();

    expect(pathname()).toBe('/');
    expect(routeNames()).toEqual(['index']);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('the Android Back key leaves at once without a question', async () => {
    await openB({ hasChanges: false });

    let taken = false;
    await act(async () => { taken = backKey.press(); });
    await settle();

    expect(taken).toBe(true);
    expect(pathname()).toBe('/');
    expect(showAlert).not.toHaveBeenCalled();
  });
});

describe('something changed', () => {
  it('header Back asks "Discard changes?" and stays on the form', async () => {
    await openB({ hasChanges: true });

    await act(async () => { router.back(); });
    await settle();

    expect(showAlert).toHaveBeenCalledTimes(1);
    const alert = lastAlert();
    expect(alert.title).toBe('Discard changes?');
    expect(alert.message).toBe('Your changes have not been saved.');
    expect(alert.buttons.map(b => [b.text, b.style])).toEqual([
      ['Keep editing', 'cancel'],
      ['Discard', 'destructive'],
    ]);
    expect(alert.options).toEqual({ cancelable: true });
    expect(pathname()).toBe('/b');
    expect(routeNames()).toEqual(['index', 'b']);
  });

  it('"Discard" calls onDiscard once and then leaves', async () => {
    const onDiscard = jest.fn();
    await openB({ hasChanges: true, onDiscard });
    await act(async () => { router.back(); });
    await settle();

    await press('Discard');

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(pathname()).toBe('/');
    expect(routeNames()).toEqual(['index']);
    // Leaving after Discard does not ask a second time.
    expect(showAlert).toHaveBeenCalledTimes(1);
  });

  it('"Keep editing" stays on the form, and the next Back asks again', async () => {
    const onDiscard = jest.fn();
    await openB({ hasChanges: true, onDiscard });
    await act(async () => { router.back(); });
    await settle();

    await press('Keep editing');

    expect(pathname()).toBe('/b');
    expect(onDiscard).not.toHaveBeenCalled();

    await act(async () => { router.back(); });
    await settle();
    expect(showAlert).toHaveBeenCalledTimes(2);
    expect(pathname()).toBe('/b');
  });

  it('the Android Back key asks the same question', async () => {
    await openB({ hasChanges: true });

    let taken = false;
    await act(async () => { taken = backKey.press(); });
    await settle();

    expect(taken).toBe(true);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(lastAlert().title).toBe('Discard changes?');
    expect(pathname()).toBe('/b');

    await press('Discard');
    expect(pathname()).toBe('/');
  });

  it('the iOS swipe and the native header Back (a POP) ask the same question', async () => {
    await openB({ hasChanges: true });

    await act(async () => { routerStore.navigationRef.dispatch(StackActions.pop()); });
    await settle();

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(pathname()).toBe('/b');

    await press('Discard');
    expect(pathname()).toBe('/');
  });

  it('uses the title and message a create form passes', async () => {
    await openB({ hasChanges: true, title: 'Discard this item?', message: 'The item you typed will not be saved.' });

    await act(async () => { router.back(); });
    await settle();

    expect(lastAlert().title).toBe('Discard this item?');
    expect(lastAlert().message).toBe('The item you typed will not be saved.');
  });

  it('follows the form: asks once something is typed, and no more once it is undone', async () => {
    await openB({ hasChanges: false });
    await setChanges(true);

    await act(async () => { router.back(); });
    await settle();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(pathname()).toBe('/b');

    await setChanges(false);
    await act(async () => { router.back(); });
    await settle();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(pathname()).toBe('/');
  });
});

describe('a deliberate way out goes through without a question', () => {
  it('router.replace (the route guard on sign-out)', async () => {
    await openB({ hasChanges: true });

    await act(async () => { router.replace('/'); });
    await settle();

    expect(showAlert).not.toHaveBeenCalled();
    expect(pathname()).toBe('/');
    expect(routeNames()).not.toContain('b');
  });

  it('POP_TO_TOP (router.dismissAll)', async () => {
    await openB({ hasChanges: true });

    await act(async () => { router.dismissAll(); });
    await settle();

    expect(showAlert).not.toHaveBeenCalled();
    expect(pathname()).toBe('/');
    expect(routeNames()).toEqual(['index']);
  });

  it('a reset of the whole stack (session ended)', async () => {
    await openB({ hasChanges: true });

    await act(async () => {
      routerStore.navigationRef.dispatch({
        type: 'RESET',
        payload: { index: 0, routes: [{ name: 'index' }] },
      } as never);
    });
    await settle();

    expect(showAlert).not.toHaveBeenCalled();
    expect(pathname()).toBe('/');
  });

  it('leaveWithoutAsking(() => router.back()) after a save', async () => {
    const onDiscard = jest.fn();
    await openB({ hasChanges: true, onDiscard });

    await act(async () => { leaveWithoutAsking(() => router.back()); });
    await settle();

    expect(showAlert).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(pathname()).toBe('/');
    expect(routeNames()).toEqual(['index']);
  });
});
