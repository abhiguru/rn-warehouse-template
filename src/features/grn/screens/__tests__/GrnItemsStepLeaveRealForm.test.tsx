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
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
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

const mounted: ReactTestRenderer[] = [];
async function render(mode: 'create' | 'edit') {
  mockMode = mode;
  mockStore = makeStore();
  ROWS.forEach((item) => mockStore.dispatch(addItem(item)));
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GrnItemsStep mode={mode} />);
  });
  mounted.push(tree);
  mockActions.length = 0;
  return tree;
}

const isText = (node: ReactTestInstance) => (node.type as unknown) === 'Text';
const textOf = (node: ReactTestInstance) => ([] as unknown[]).concat(node.props.children).join('');
const texts = (tree: ReactTestRenderer) => tree.root.findAll(isText).map(textOf);
/** The control a worker would tap: the first drawn node with this spoken name and a press handler. */
const control = (tree: ReactTestRenderer, matches: (label: string) => boolean) => {
  const found = tree.root.findAll(
    (node) => typeof node.props.accessibilityLabel === 'string' && matches(node.props.accessibilityLabel) && typeof node.props.onPress === 'function',
    { deep: false }
  );
  expect(found.length).toBeGreaterThan(0);
  return found[0];
};
const field = (tree: ReactTestRenderer, label: string) =>
  tree.root.find((node) => (node.type as unknown) === 'TextInput' && node.props.accessibilityLabel === label);
/** What the real form shows of its item. */
const shown = (tree: ReactTestRenderer) => ({
  quantity: field(tree, 'Receipt item quantity').props.value as string,
  weight: field(tree, 'Weight each, in kilograms').props.value as string,
  rackText: field(tree, 'Rack').props.value as string,
  mark: field(tree, 'Mark').props.value as string,
  chips: tree.root
    .findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio' && node.props.accessibilityState?.selected === true)
    .map((node) => node.props.accessibilityLabel as string),
});
/** The rows of the saved-items sheet, top to bottom; none while the sheet is closed. */
const savedRows = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.props.accessibilityHint === 'Opens this item for editing' && typeof node.props.onPress === 'function', { deep: false });

/** Saved row 1 put back into the form the way a worker does it: the strip's link, then a tap on the row. */
async function reopenRowOne(tree: ReactTestRenderer) {
  expect(savedRows(tree)).toHaveLength(0);
  // The strip above the entry row opens the saved items a moment after the keyboard is put away.
  await act(async () => { control(tree, (label) => label.endsWith('View 2 saved items')).props.onPress(); });
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(savedRows(tree)).toHaveLength(2);
  expect(texts(tree)).toContain('Saved items (2)');

  await act(async () => { savedRows(tree)[0].props.onPress(); });

  // The sheet has closed and the real form holds row 1.
  expect(savedRows(tree)).toHaveLength(0);
  expect(texts(tree)).toEqual(expect.arrayContaining(['Editing item', 'Item 1 · Fictional potato', '11 Bag']));
  expect(shown(tree)).toEqual({ quantity: '11', weight: '50', rackText: 'ROW 3', mark: 'M1', chips: ['Floor F1', 'Chamber C4'] });
}

const pressNext = (tree: ReactTestRenderer) =>
  act(async () => { await control(tree, (label) => label === 'Review').props.onPress(); });

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
  for (const tree of mounted.splice(0)) {
    await act(async () => { tree.unmount(); });
  }
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe.each([
  ['create', '/grn-form/step3'],
  ['edit', `/grn-edit/${GRN_ID}/step3`],
] as const)('GRN items step with the real entry form, %s', (mode, reviewRoute) => {
  it('a saved item that was reopened and not changed is not asked about: Next opens Review', async () => {
    const tree = await render(mode);
    const before = mockStore.getState().grnForm.items;
    await reopenRowOne(tree);

    await pressNext(tree);

    expect(alerts()).toEqual([]);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(reviewRoute);
    // Review gets the two rows as they were stored; nothing was written for row 1.
    expect(sentToReview()).toEqual(ROWS);
    expect(mockActions.filter((action) => action.type === updateItem.type)).toEqual([]);
    expect(mockStore.getState().grnForm.items).toEqual(before);
  });

  it('Add item and the check mark stay pressable with an empty line; a tap says what is missing and stores nothing', async () => {
    const tree = await render(mode);
    const before = mockStore.getState().grnForm.items;

    for (const label of ['Add item', 'Save receipt item']) {
      const target = control(tree, (name) => name === label);
      expect(target.props.disabled).not.toBe(true);
      alerts().length = 0;
      await act(async () => { await target.props.onPress(); });
      expect(alerts().at(-1)?.[0]).toBe('Check the item details');
    }
    expect(mockStore.getState().grnForm.items).toEqual(before);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('a different quantity typed into the Quantity field is asked about: Next goes nowhere', async () => {
    const tree = await render(mode);
    const before = mockStore.getState().grnForm.items;
    await reopenRowOne(tree);

    await act(async () => { field(tree, 'Receipt item quantity').props.onChangeText('99'); });
    expect(shown(tree).quantity).toBe('99');
    expect(texts(tree)).toContain('99 Bag');

    await pressNext(tree);

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
    const tree = await render(mode);
    await reopenRowOne(tree);
    await act(async () => { field(tree, 'Weight each, in kilograms').props.onChangeText('12.5'); });
    await pressNext(tree);
    await answer('Save changes');
    expect(alerts().at(-1)?.slice(0, 2)).toEqual(['Check the item details', 'Fix the highlighted fields, then save the item.']);
    expect(texts(tree)).toContain('Weight must be a whole number');
    mockScrollTo.mockClear();

    await answer('OK');

    // Item (220) and Quantity (117) are drawn before it.
    expect(mockScrollTo.mock.calls).toEqual([[{ x: 337, animated: true }]]);
    expect(router.push).not.toHaveBeenCalled();
  });
});
