/**
 * The edit dispatch layout: it reads the dispatch before it draws any step, on every entry (review 2026-10-20, A2).
 *
 * - It starts on a spinner, so the form is never drawn empty, or with an earlier edit's values, first.
 * - Every entry resets the form and reads the dispatch again, also when the form still holds that dispatch.
 * - A failed read shows a full screen error with "Try again" and "Close", leaves the form empty and draws no step.
 * - Someone who may not edit is sent to the Dispatch tab and nothing is read.
 * - The form is reset when the layout goes, unless another form is still open (finding 3).
 * - Another dispatch form (an edit, or a new dispatch) that is open turns the visit away and is not touched.
 */
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import dispatchFormReducer, { loadDispatchData as loadIntoForm, updateHeader } from '@/store/slices/dispatchFormSlice';
import { loadDispatchData } from '@/features/dispatch/services/dispatchFormService';
import { openDispatchFormBlocking, registerDispatchForm } from '@/features/dispatch/utils/openDispatchForms';
import { showAlert } from '@/utils/alert';
import { createEmptyDispatchHeader, type DispatchItemData } from '@/types/dispatch.types';
import DispatchEditLayout from '../../../app/dispatch-edit/[id]/_layout';

const DISPATCH_ID = 'dispatch-42';

function makeStore() {
  return configureStore({
    reducer: {
      dispatchForm: dispatchFormReducer,
      auth: () => ({ userProfile: { role: 'staff' } }),
      theme: () => ({ preference: 'light', brand: 'orange' }),
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
}
let mockStore: ReturnType<typeof makeStore>;
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppStore: () => mockStore,
    useAppSelector: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
let mockCanUpdate = true;
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canUpdate: mockCanUpdate }) }));
jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = Object.assign(
    (props: { screenOptions?: unknown }) => React.createElement('Stack', { screenOptions: props.screenOptions }),
    { Screen: () => null }
  );
  return {
    Stack,
    router: { replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ id: 'dispatch-42' }),
  };
});
jest.mock('@/features/dispatch/services/dispatchFormService', () => ({ loadDispatchData: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: 'SafeAreaView',
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));

const load = jest.mocked(loadDispatchData);
const line = { unique_id: 'line-1', grnItems_id: 'lot-1', disp_quantity: 10, original_disp_quantity: 10 } as DispatchItemData;
const loaded = (note = 'Fresh from the server') => ({
  success: true,
  data: { header: { ...createEmptyDispatchHeader(), disp_no: 'DD0042', note }, items: [line] },
}) as never;

/** A promise the test settles when it wants. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

let tree: ReactTestRenderer;
const render = async () => {
  await act(async () => { tree = create(<DispatchEditLayout />); });
};
const text = () => JSON.stringify(tree.toJSON());
const hasSteps = () => tree.root.findAllByType('Stack' as unknown as React.ElementType).length > 0;
const press = async (label: string) => {
  const control = tree.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  await act(async () => { control.props.onPress(); });
};
const form = () => mockStore.getState().dispatchForm;

beforeEach(() => {
  jest.clearAllMocks();
  mockStore = makeStore();
  mockCanUpdate = true;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.restoreAllMocks();
});

describe('while the dispatch loads', () => {
  it('shows a spinner and none of the steps, and the form holds nothing', async () => {
    const answer = deferred<unknown>();
    load.mockReturnValue(answer.promise as never);

    await render();

    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(text()).toContain('Loading dispatch');
    expect(hasSteps()).toBe(false);
    expect(form().dispatch_id).toBeNull();
    await act(async () => { answer.resolve(loaded()); });
  });

  it('is on the spinner already in the first render, not after the first effect', () => {
    load.mockReturnValue(new Promise(() => {}) as never);

    act(() => { tree = create(<DispatchEditLayout />); });

    expect(hasSteps()).toBe(false);
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  });
});

describe('when the dispatch is loaded', () => {
  it('draws the steps, with the swipe back off, and the form holds the dispatch', async () => {
    load.mockResolvedValue(loaded());

    await render();

    expect(load).toHaveBeenCalledWith(DISPATCH_ID);
    expect(hasSteps()).toBe(true);
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    const stack = tree.root.findByType('Stack' as unknown as React.ElementType);
    expect(stack.props.screenOptions).toMatchObject({ headerShown: false, gestureEnabled: false });
    expect(form().dispatch_id).toBe(DISPATCH_ID);
    expect(form().header.disp_no).toBe('DD0042');
    expect(form().items).toHaveLength(1);
  });

  it('reads the dispatch again on every entry, also when the form still holds it', async () => {
    // An earlier visit left this dispatch in the form with a change nobody saved.
    mockStore.dispatch(loadIntoForm({ dispatchId: DISPATCH_ID, header: { ...createEmptyDispatchHeader(), disp_no: 'DD0042', note: 'Unsaved change' }, items: [line] }));
    mockStore.dispatch(updateHeader({ note: 'Unsaved change, typed later' }));
    load.mockResolvedValue(loaded('Fresh from the server'));

    await render();

    expect(load).toHaveBeenCalledTimes(1);
    expect(hasSteps()).toBe(true);
    expect(form().header.note).toBe('Fresh from the server');
  });

  it('does not show the values of an earlier visit while the new read is on its way', async () => {
    mockStore.dispatch(loadIntoForm({ dispatchId: DISPATCH_ID, header: { ...createEmptyDispatchHeader(), disp_no: 'DD0042', note: 'Unsaved change' }, items: [line] }));
    const answer = deferred<unknown>();
    load.mockReturnValue(answer.promise as never);

    await render();

    expect(hasSteps()).toBe(false);
    expect(form().header.note).toBe('');
    expect(form().items).toEqual([]);
    await act(async () => { answer.resolve(loaded()); });
  });
});

describe('when the dispatch cannot be loaded', () => {
  it('shows a full screen error with Try again and Close, leaves the form empty and does not leave by itself', async () => {
    load.mockResolvedValue({ success: false, error: 'Server said no' } as never);

    await render();

    expect(hasSteps()).toBe(false);
    expect(text()).toContain("Couldn't open the dispatch");
    expect(text()).toContain('Try again');
    expect(text()).toContain('Close');
    expect(form().dispatch_id).toBeNull();
    expect(form().items).toEqual([]);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('a read that throws is the same', async () => {
    load.mockRejectedValue(new Error('Network request failed'));

    await render();

    expect(hasSteps()).toBe(false);
    expect(text()).toContain("Couldn't open the dispatch");
    expect(form().dispatch_id).toBeNull();
  });

  it('Try again reads once more, and the steps come when it works', async () => {
    load.mockResolvedValueOnce({ success: false, error: 'Server said no' } as never);
    load.mockResolvedValueOnce(loaded());
    await render();

    await press('Try again');

    expect(load).toHaveBeenCalledTimes(2);
    expect(hasSteps()).toBe(true);
    expect(text()).not.toContain("Couldn't open the dispatch");
    expect(form().dispatch_id).toBe(DISPATCH_ID);
  });

  it("Close goes back to the dispatch's page, one step", async () => {
    load.mockResolvedValue({ success: false, error: 'Server said no' } as never);
    await render();

    await press('Close');

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('someone who may not edit', () => {
  it('is sent to the Dispatch tab, sees nothing of the form, and nothing is read', async () => {
    mockCanUpdate = false;
    load.mockResolvedValue(loaded());

    await render();

    expect(router.replace).toHaveBeenCalledWith('/(tabs)/dispatch');
    expect(load).not.toHaveBeenCalled();
    expect(hasSteps()).toBe(false);
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });
});

describe('when the layout goes', () => {
  it('resets the form', async () => {
    load.mockResolvedValue(loaded());
    await render();
    expect(form().dispatch_id).toBe(DISPATCH_ID);

    await act(async () => { tree.unmount(); });

    expect(form().dispatch_id).toBeNull();
    expect(form().items).toEqual([]);
    expect(form().header.disp_no).toBe('');
    // The unmount in afterEach finds nothing to do.
    await act(async () => { tree = create(<React.Fragment />); });
  });

  it('drops a read that was still on its way', async () => {
    const answer = deferred<unknown>();
    load.mockReturnValue(answer.promise as never);
    await render();

    await act(async () => { tree.unmount(); });
    await act(async () => { answer.resolve(loaded()); });

    expect(form().dispatch_id).toBeNull();
    await act(async () => { tree = create(<React.Fragment />); });
  });
});

describe('while the layout is open', () => {
  it('is an open dispatch form, named by its own number once it is loaded, and is not one after it goes', async () => {
    load.mockResolvedValue(loaded());

    await render();

    expect(openDispatchFormBlocking()).toMatchObject({ kind: 'edit', id: DISPATCH_ID, number: 'DD0042' });

    await act(async () => { tree.unmount(); });

    expect(openDispatchFormBlocking()).toBeNull();
    await act(async () => { tree = create(<React.Fragment />); });
  });

  it('does not empty the form when it goes while another form is still open', async () => {
    load.mockResolvedValue(loaded());
    await render();
    const release = registerDispatchForm({ kind: 'create' });
    try {
      await act(async () => { tree.unmount(); });

      expect(form().dispatch_id).toBe(DISPATCH_ID);
    } finally {
      release();
    }
    await act(async () => { tree = create(<React.Fragment />); });
  });
});

describe("another dispatch's form is open (finding 3)", () => {
  it('turns the visit away: nothing is read, the form that is open is not touched, the screen goes back', async () => {
    mockStore.dispatch(loadIntoForm({ dispatchId: 'other-dispatch', header: { ...createEmptyDispatchHeader(), disp_no: 'DD0007' }, items: [line] }));
    const release = registerDispatchForm({ kind: 'edit', id: 'other-dispatch' });
    try {
      await render();

      expect(load).not.toHaveBeenCalled();
      expect(hasSteps()).toBe(false);
      expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
      expect(form().dispatch_id).toBe('other-dispatch');
      expect(form().items).toHaveLength(1);
      expect(router.back).toHaveBeenCalledTimes(1);
      // Names the dispatch that is open, with Close and "Open it".
      expect(showAlert).toHaveBeenCalledWith('Another dispatch is open', 'Finish or cancel the edit of dispatch DD0007 first.', expect.any(Array));
    } finally {
      release();
    }
  });

  it('"Open it" takes the person to the form that is open', async () => {
    const release = registerDispatchForm({ kind: 'edit', id: 'other-dispatch' });
    try {
      await render();

      const buttons = jest.mocked(showAlert).mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
      expect(buttons.map((button) => button.text)).toEqual(['Close', 'Open it']);
      buttons[1].onPress!();

      expect(router.dismissTo).toHaveBeenCalledWith('/dispatch-edit/other-dispatch/step1');
    } finally {
      release();
    }
  });

  it('says so for a new dispatch that is open', async () => {
    const release = registerDispatchForm({ kind: 'create' });
    try {
      await render();

      expect(showAlert).toHaveBeenCalledWith('Another dispatch is open', 'Finish or cancel the new dispatch first.', expect.any(Array));
      expect(load).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });

  it('does not empty the open form when the turned-away layout goes', async () => {
    mockStore.dispatch(loadIntoForm({ dispatchId: 'other-dispatch', header: { ...createEmptyDispatchHeader(), disp_no: 'DD0007' }, items: [line] }));
    const release = registerDispatchForm({ kind: 'edit', id: 'other-dispatch' });
    try {
      await render();

      await act(async () => { tree.unmount(); });

      expect(form().dispatch_id).toBe('other-dispatch');
      expect(form().header.disp_no).toBe('DD0007');
    } finally {
      release();
    }
    await act(async () => { tree = create(<React.Fragment />); });
  });
});
