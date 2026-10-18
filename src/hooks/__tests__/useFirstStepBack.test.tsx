/**
 * The Android Back key in the create forms (owner decision 7 of 2026-10-11):
 * on the first step it asks before discarding when something was entered and
 * leaves at once when nothing was; on later steps it goes back one step.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BackHandler } from 'react-native';
import { router } from 'expo-router';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { useFirstStepBack, type FirstStepBackOptions } from '../useFirstStepBack';
import GRNFormStep2 from '../../../app/grn-form/step2';
import GRNFormStep3 from '../../../app/grn-form/step3';
import DispatchFormStep2 from '../../../app/dispatch-form/step2';
import DispatchFormStep3 from '../../../app/dispatch-form/step3';

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
// The steps themselves are not under test here, only the Back key of their routes.
jest.mock('@/features/grn/screens/GrnItemsStep', () => ({ __esModule: true, default: () => null }));
jest.mock('@/features/grn/screens/GrnReviewStep', () => ({ __esModule: true, default: () => null }));
jest.mock('@/features/dispatch/screens', () => ({ DispatchItemsStep: () => null, DispatchReviewStep: () => null }));

let back: ReturnType<typeof installHardwareBack>;
beforeEach(() => {
  jest.clearAllMocks();
  back = installHardwareBack();
});
afterEach(() => back.restore());

async function mount(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(element); });
  return tree;
}

describe('Back on the first step of a create form', () => {
  const askToDiscard = jest.fn();
  function FirstStep(props: Partial<FirstStepBackOptions>) {
    useFirstStepBack({ hasData: false, askToDiscard, exitRoute: '/(tabs)/grn', ...props });
    return null;
  }

  it('leaves with dismissTo, not replace, when asked to (one entry of the tab stays in the stack)', async () => {
    const tree = await mount(<FirstStep exitRoute="/(tabs)/invoices" exitWith="dismissTo" />);

    expect(back.press()).toBe(true);

    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/invoices');
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('asks before discarding when something was entered, and goes nowhere', async () => {
    const tree = await mount(<FirstStep hasData />);

    expect(back.press()).toBe(true);

    expect(askToDiscard).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('leaves for the list at once when nothing was entered', async () => {
    const tree = await mount(<FirstStep hasData={false} />);

    expect(back.press()).toBe(true);

    expect(askToDiscard).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/grn');
    await act(async () => { tree.unmount(); });
  });

  it('follows the form: empty, then filled, then emptied again', async () => {
    const tree = await mount(<FirstStep hasData={false} />);
    await act(async () => { tree.update(<FirstStep hasData />); });
    back.press();
    expect(askToDiscard).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();

    await act(async () => { tree.update(<FirstStep hasData={false} />); });
    back.press();
    expect(askToDiscard).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/grn');
    // One listener throughout, not one more for each change of the form.
    expect(back.count()).toBe(1);
    await act(async () => { tree.unmount(); });
  });

  it('stays behind a listener added later (an open sheet), however often the step draws itself', async () => {
    const tree = await mount(<FirstStep hasData />);
    // What a sheet does when it opens: a listener of its own, added after the step's.
    const sheetBack = jest.fn(() => true);
    const sheet = BackHandler.addEventListener('hardwareBackPress', sheetBack);

    // A new `askToDiscard` and a new `hasData` with every drawing, as a screen passes them.
    await act(async () => { tree.update(<FirstStep hasData={false} askToDiscard={() => askToDiscard()} />); });
    await act(async () => { tree.update(<FirstStep hasData askToDiscard={() => askToDiscard()} />); });

    expect(back.press()).toBe(true);
    expect(sheetBack).toHaveBeenCalledTimes(1);
    expect(askToDiscard).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(back.count()).toBe(2);

    // The sheet has closed: Back is the step's again, with what the form holds now.
    sheet.remove();
    expect(back.press()).toBe(true);
    expect(askToDiscard).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });

  it('starts to listen when it is switched on later, and stops when switched off', async () => {
    const tree = await mount(<FirstStep enabled={false} hasData />);
    expect(back.press()).toBe(false);

    await act(async () => { tree.update(<FirstStep enabled hasData />); });
    expect(back.press()).toBe(true);
    expect(askToDiscard).toHaveBeenCalledTimes(1);

    await act(async () => { tree.update(<FirstStep enabled={false} hasData />); });
    expect(back.press()).toBe(false);
    expect(askToDiscard).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });

  it('leaves Back to the system where it is switched off (the edit form of the same screen)', async () => {
    const tree = await mount(<FirstStep enabled={false} hasData />);

    expect(back.press()).toBe(false);

    expect(askToDiscard).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('stops listening when the step is left', async () => {
    const tree = await mount(<FirstStep hasData />);
    expect(back.count()).toBe(1);

    await act(async () => { tree.unmount(); });

    expect(back.count()).toBe(0);
    expect(back.press()).toBe(false);
  });
});

describe('Back on the later steps of a create form', () => {
  it.each([
    ['GRN items', <GRNFormStep2 key="g2" />, '/grn-form/step1'],
    ['GRN review', <GRNFormStep3 key="g3" />, '/grn-form/step2'],
    ['dispatch items', <DispatchFormStep2 key="d2" />, '/dispatch-form/step1'],
    ['dispatch review', <DispatchFormStep3 key="d3" />, '/dispatch-form/step2'],
  ])('%s: goes to the step before, without a question', async (_name, screen, previous) => {
    const { showAlert } = require('@/utils/alert');
    const tree = await mount(screen);

    expect(back.press()).toBe(true);

    // To the step already in the stack, not a second entry of it (src/tests/navigation/InvoiceFormStack.test.tsx).
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith(previous);
    expect(router.replace).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});
