/**
 * The new dispatch layout (review 2026-10-20, finding 3): it is an open dispatch form while it is open, and it is not
 * opened over another dispatch form (an edit that is open, or an earlier new dispatch): the visit is turned away with
 * a message, the form that is open is left as it is, and the screen goes back.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { openDispatchFormBlocking, registerDispatchForm } from '@/features/dispatch/utils/openDispatchForms';
import { showAlert } from '@/utils/alert';
import DispatchFormLayout from '../../../app/dispatch-form/_layout';

const mockState = { dispatchForm: { header: { disp_no: 'DD0007' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => mockState }),
}));
let mockCanCreate = true;
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: mockCanCreate }) }));
jest.mock('expo-router', () => {
  const Stack = (props: { screenOptions?: unknown }) => require('react').createElement('Stack', { screenOptions: props.screenOptions });
  return { Stack, router: { replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() } };
});
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

let tree: ReactTestRenderer;
const render = async () => {
  await act(async () => { tree = create(<DispatchFormLayout />); });
};
const hasSteps = () => tree.root.findAllByType('Stack' as unknown as React.ElementType).length > 0;

beforeEach(() => {
  jest.clearAllMocks();
  mockCanCreate = true;
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.restoreAllMocks();
});

describe('when no other form is open', () => {
  it('draws the steps, and is an open dispatch form until it goes', async () => {
    await render();

    expect(hasSteps()).toBe(true);
    expect(openDispatchFormBlocking()).toEqual({ kind: 'create' });
    expect(router.back).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();

    await act(async () => { tree.unmount(); });

    expect(openDispatchFormBlocking()).toBeNull();
    await act(async () => { tree = create(<React.Fragment />); });
  });
});

describe('when another dispatch form is open', () => {
  it('turns the visit away: no steps, a message naming the open dispatch, the screen goes back, nothing is registered', async () => {
    const open = { kind: 'edit', id: 'other-dispatch', number: 'DD0007' } as const;
    const release = registerDispatchForm(open);
    try {
      await render();

      expect(hasSteps()).toBe(false);
      expect(router.back).toHaveBeenCalledTimes(1);
      expect(showAlert).toHaveBeenCalledWith('Another dispatch is open', 'Finish or cancel the edit of dispatch DD0007 first.', expect.any(Array));
      // Still the form that was open, not this visit.
      expect(openDispatchFormBlocking()).toBe(open);
    } finally {
      release();
    }
  });

  it('says so for an earlier new dispatch, and "Open it" takes the person back to it', async () => {
    const release = registerDispatchForm({ kind: 'create' });
    try {
      await render();

      expect(showAlert).toHaveBeenCalledWith('Another dispatch is open', 'Finish or cancel the new dispatch first.', expect.any(Array));
      const buttons = jest.mocked(showAlert).mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
      buttons[1].onPress!();
      expect(router.dismissTo).toHaveBeenCalledWith('/dispatch-form/step1');
    } finally {
      release();
    }
  });
});

describe('someone who may not create', () => {
  it('is sent to the Dispatch tab and sees nothing of the form', async () => {
    mockCanCreate = false;

    await render();

    expect(router.replace).toHaveBeenCalledWith('/(tabs)/dispatch');
    expect(hasSteps()).toBe(false);
  });
});
