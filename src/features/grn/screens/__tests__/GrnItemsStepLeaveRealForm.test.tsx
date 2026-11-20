/**
 * The GRN items step with its real entry form (owner decision of 2026-10-14,
 * review finding UX-01).
 *
 * GrnItemsStepLeave.test.tsx puts stand-ins in place of the entry form, the
 * saved-items sheet, the footer and the step header, and calls their handlers.
 * That cannot show what the real form does when a saved item is put into it:
 * a form that reported a field (a rack rebuilt from its chips, a weight or a
 * quantity written back in another form) would make a reopened item count as
 * changed, and "Save changes to this item?" would be asked about nothing.
 *
 * Here the step, `HorizontalItemForm`, the saved-items sheet, the footer and
 * the step header are the real ones, and the test taps and types as a worker
 * does. Stand-ins are left only for what cannot run in Jest or is not part of
 * the step: navigation, the store wiring, the item search (the network) and
 * native modules.
 */
import React from 'react';
import { Alert, ScrollView } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { configureStore, type UnknownAction } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import { GrnItemsStep } from '@/features/grn/screens/GrnItemsStep';
import grnFormReducer, { addItem, reconcileItems, updateItem, type GRNItemData } from '@/store/slices/grnFormSlice';

const GRN_ID = '11111111-2222-4333-8444-555555555555';

const makeStore = () => configureStore({ reducer: { grnForm: grnFormReducer }, middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }) });
let mockStore = makeStore();
const mockActions: UnknownAction[] = [];
const mockDispatch = (action: UnknownAction) => {
  mockActions.push(action);
  return mockStore.dispatch(action);
};
let mockMode: 'create' | 'edit' = 'edit';

// The store wiring, as in GrnItemsStepLeave.test.tsx.
// The add-item sheet in the entry form needs the network state.
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isStaffRole: false }) })); // WH-79: staff may add an item
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: mockStore.getState().grnForm }),
}));
jest.mock('@/hooks', () => ({
  useGRNForm: () => {
    const items = require('react').useSyncExternalStore(mockStore.subscribe, () => mockStore.getState().grnForm.items);
    return {
      header: { gr_no: 'A0010' },
      items,
      grnId: mockMode === 'edit' ? '11111111-2222-4333-8444-555555555555' : null,
      tempGrnId: null,
      isCreateMode: mockMode === 'create',
      resetFormState: jest.fn(),
    };
  },
}));
// Navigation. The step is in focus for as long as it is mounted.
jest.mock('expo-router', () => {
  const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() };
  return {
    router: mockRouter,
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({ id: '11111111-2222-4333-8444-555555555555' }),
    useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  };
});
// Native modules and the network.
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: (props: { children?: React.ReactNode }) => require('react').createElement('Swipeable', null, props.children),
}));
jest.mock('react-native-gesture-handler', () => {
  const mockReact = require('react');
  return {
    GestureHandlerRootView: (props: { children?: React.ReactNode }) => mockReact.createElement('GHRoot', null, props.children),
  };
});
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (run: () => unknown) => run() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({
  deleteGRNImage: jest.fn(),
  generateTempGRNId: () => 'temp_grn_generated',
  uploadGRNItemImage: jest.fn(),
  validateImageFile: () => ({ valid: true }),
}));
jest.mock('@/utils/localPhotoFiles', () => ({ releaseLocalPhotos: jest.fn(async () => 0) }));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn(async () => []) }));

/** Ids shaped as the server's. */
const lineId = (n: number) => `55555555-2222-4333-8444-${String(n).padStart(12, '0')}`;
const itemId = (n: number) => `66666666-2222-4333-8444-${String(n).padStart(12, '0')}`;

/**
 * Two saved rows. Row 1 has every part the form rewrites when it shows a line:
 * a rack that ends in a floor and a chamber (the form splits it into text and
 * chips and builds it again), a weight and a mark.
 */
const ROWS: GRNItemData[] = [
  { grn_trl_id: lineId(1), item_table_id: itemId(1), item_name: 'Fictional potato', packaging: 'Bag', qty: 11, stock: 11, weight: 50, rack: 'ROW 3/F1/C4', package_mark: 'M1', trl_images: [] },
  { grn_trl_id: lineId(2), item_table_id: itemId(2), item_name: 'Fictional onion', packaging: 'Crate', qty: 12, stock: 12, weight: 25, rack: 'R2', package_mark: 'M2', trl_images: [] },
];

let user: ReturnType<typeof userEvent.setup>;
async function mountStep(mode: 'create' | 'edit') {
  mockMode = mode;
  mockStore = makeStore();
  ROWS.forEach((item) => mockStore.dispatch(addItem(item)));
  await render(<GrnItemsStep mode={mode} />);
  mockActions.length = 0;
}

/** The control a worker would tap: a button with this spoken name. */
const control = (name: string | RegExp) => screen.getByRole('button', { name });
const field = (label: string) => screen.getByLabelText(label);
/** What the real form shows of its item. */
const shown = () => ({
  quantity: (field('Receipt item quantity').props as { value: string }).value,
  weight: (field('Weight each, in kilograms').props as { value: string }).value,
  rackText: (field('Rack').props as { value: string }).value,
  mark: (field('Mark').props as { value: string }).value,
  chips: screen.queryAllByRole('radio', { selected: true }).map((node) => node.props.accessibilityLabel as string),
});
/** The rows of the saved-items sheet, top to bottom; none while the sheet is closed. */
const savedRows = () => screen.queryAllByHintText('Opens this item for editing');
/** Replaces what a field holds, as a worker clears it and types. */
async function enter(label: string, value: string) {
  await user.clear(field(label));
  await user.type(field(label), value);
}

/** Saved row 1 put back into the form the way a worker does it: the strip's link, then a tap on the row. */
async function reopenRowOne() {
  expect(savedRows()).toHaveLength(0);
  // The strip above the entry row opens the saved items a moment after the keyboard is put away.
  await user.press(control(/View 2 saved items$/));
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(savedRows()).toHaveLength(2);
  expect(screen.getByText('Saved items (2)')).toBeOnTheScreen();

  await user.press(savedRows()[0]);

  // The sheet has closed and the real form holds row 1.
  expect(savedRows()).toHaveLength(0);
  expect(screen.getByText('Editing item')).toBeOnTheScreen();
  expect(screen.getByText('Item 1 · Fictional potato')).toBeOnTheScreen();
  expect(screen.getByText('11 Bag')).toBeOnTheScreen();
  expect(shown()).toEqual({ quantity: '11', weight: '50', rackText: 'ROW 3', mark: 'M1', chips: ['Floor F1', 'Chamber C4'] });
}

const pressNext = () => user.press(control('Review'));

const alerts = () => jest.mocked(Alert.alert).mock.calls;
/** Presses a button of the dialog shown last. */
const answer = async (text: string) => {
  const button = alerts().at(-1)?.[2]?.find((candidate) => candidate.text === text);
  expect(button).toBeDefined();
  await act(async () => { await button!.onPress?.(); });
};
// The entry row's ref is the jest mock's instance, whose scrollTo is one shared jest.fn (react-native's jest preset).
const mockScrollTo = ScrollView.prototype.scrollTo as unknown as jest.Mock;
const sentToReview = () => mockActions.find((action) => action.type === reconcileItems.type)?.payload as GRNItemData[] | undefined;

beforeEach(() => {
  jest.useFakeTimers();
  user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
  jest.clearAllMocks();
  mockActions.length = 0;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(require('react-native').Vibration, 'vibrate').mockImplementation(() => {});
  jest.spyOn(require('react-native').Keyboard, 'dismiss').mockImplementation(() => {});
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((run: FrameRequestCallback) => { run(0); return 0; });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  // A tree left mounted can log after the test run has ended.
  await act(async () => { jest.runOnlyPendingTimers(); });
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe.each([
  ['create', '/grn-form/step3'],
  ['edit', `/grn-edit/${GRN_ID}/step3`],
] as const)('GRN items step with the real entry form, %s', (mode, reviewRoute) => {
  it('a saved item that was reopened and not changed is not asked about: Next opens Review', async () => {
    await mountStep(mode);
    const before = mockStore.getState().grnForm.items;
    await reopenRowOne();

    await pressNext();

    expect(alerts()).toEqual([]);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(reviewRoute);
    // Review gets the two rows as they were stored; nothing was written for row 1.
    expect(sentToReview()).toEqual(ROWS);
    expect(mockActions.filter((action) => action.type === updateItem.type)).toEqual([]);
    expect(mockStore.getState().grnForm.items).toEqual(before);
  });

  it('Add item and the check mark stay pressable with an empty line; a tap says what is missing and stores nothing', async () => {
    await mountStep(mode);
    const before = mockStore.getState().grnForm.items;

    for (const label of ['Add item', 'Save receipt item']) {
      const target = control(label);
      expect(target).toBeEnabled();
      alerts().length = 0;
      await user.press(target);
      expect(alerts().at(-1)?.[0]).toBe('Check the item details');
    }
    expect(mockStore.getState().grnForm.items).toEqual(before);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('a different quantity typed into the Quantity field is asked about: Next goes nowhere', async () => {
    await mountStep(mode);
    const before = mockStore.getState().grnForm.items;
    await reopenRowOne();

    await enter('Receipt item quantity', '99');
    expect(shown().quantity).toBe('99');
    expect(screen.getByText('99 Bag')).toBeOnTheScreen();

    await pressNext();

    expect(alerts()).toHaveLength(1);
    expect(alerts()[0][0]).toBe('Save changes to this item?');
    expect(alerts()[0][1]).toBe("Your changes to item 1 (Fictional potato) haven't been saved yet.");
    expect(alerts()[0][2]?.map((button) => button.text)).toEqual(['Keep editing', 'Discard changes', 'Save changes']);
    expect(router.push).not.toHaveBeenCalled();
    expect(sentToReview()).toBeUndefined();
    expect(mockStore.getState().grnForm.items).toBe(before);
  });

  // Weight is a screen's width to the right of Item and Quantity: its error was marked out of view.
  it('a weight that is not a whole number: OK on the refusal scrolls the row to the Weight field', async () => {
    await mountStep(mode);
    await reopenRowOne();
    await enter('Weight each, in kilograms', '12.5');
    await pressNext();
    await answer('Save changes');
    expect(alerts().at(-1)?.slice(0, 2)).toEqual(['Check the item details', 'Fix the highlighted fields, then save the item.']);
    expect(screen.getByText('Weight must be a whole number')).toBeOnTheScreen();
    mockScrollTo.mockClear();

    await answer('OK');

    // Item (220) and Quantity (117) are drawn before it.
    expect(mockScrollTo.mock.calls).toEqual([[{ x: 361, animated: true }]]);
    expect(router.push).not.toHaveBeenCalled();
  });
});

// WH-263: the X of an edited GRN asks to discard only when something was changed: in the saved form (nothing here,
// the form was not loaded from the server) or in the item form on screen, which is not saved yet.
describe('GRN items step with the real entry form, the X of an edit', () => {
  const pressClose = () => user.press(control('Close GRN edit'));

  it('asks to discard when the saved form is unchanged but the item on screen was changed', async () => {
    await mountStep('edit');
    await reopenRowOne();
    await enter('Receipt item quantity', '99');

    await pressClose();

    expect(alerts()).toHaveLength(1);
    expect(alerts()[0][0]).toBe('Discard changes to this GRN?');
  });

  it('asks nothing when neither the saved form nor the item on screen was changed', async () => {
    await mountStep('edit');
    await reopenRowOne();

    await pressClose();

    expect(alerts()).toEqual([]);
  });
});
