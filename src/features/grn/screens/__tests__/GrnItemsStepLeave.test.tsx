/**
 * Leaving the item in the form of the GRN items step (owner decision of
 * 2026-10-14, review finding UX-01): an item that was not checkmarked is asked
 * about on every way out: footer Next and Back, both step circles, the
 * phone's Back key and opening another saved item.
 *
 * Two defects were confirmed on a phone before this:
 *  A. with a correction to a saved item in the form, Next asked nothing and
 *     Review showed the old saved values;
 *  B. "Discard item" went on with the discarded line: it was checked and
 *     stored as if "Save item" had been chosen.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { configureStore, type UnknownAction } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { GrnItemsStep, type GrnItemsBackGuard } from '@/features/grn/screens/GrnItemsStep';
import { uploadGRNItemImage } from '@/features/grn/services/imageUploadService';
import { releaseLocalPhotos } from '@/utils/localPhotoFiles';
import { setLanguage } from '@/i18n';
import grnFormReducer, {
  addItem,
  reconcileItems,
  removeItem,
  restoreItemImages,
  setCurrentStep,
  updateItem,
  type GRNImageData,
  type GRNItemData,
} from '@/store/slices/grnFormSlice';

const GRN_ID = '11111111-2222-4333-8444-555555555555';

const makeStore = () => configureStore({ reducer: { grnForm: grnFormReducer }, middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }) });
let mockStore = makeStore();
const mockActions: UnknownAction[] = [];
const mockDispatch = (action: UnknownAction) => {
  mockActions.push(action);
  return mockStore.dispatch(action);
};
let mockMode: 'create' | 'edit' = 'edit';

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
      grnId: mockMode === 'edit' ? GRN_ID : null,
      tempGrnId: null,
      isCreateMode: mockMode === 'create',
      resetFormState: jest.fn(),
    };
  },
}));
// Children are stand-ins that keep their props, so the test can call their handlers.
// The form's stand-in also takes what the step asks of the form through its ref.
const mockFormRef = { focusQty: jest.fn(), resetScroll: jest.fn(), revealField: jest.fn() };
jest.mock('@/features/grn/components/HorizontalItemForm', () => ({
  HorizontalItemForm: require('react').forwardRef((props: object, ref: React.Ref<unknown>) => {
    require('react').useImperativeHandle(ref, () => mockFormRef);
    return require('react').createElement('HorizontalItemForm', props);
  }),
}));
jest.mock('@/features/grn/components/ItemsSummaryBottomSheet', () => ({ __esModule: true, default: 'ItemsSummaryBottomSheet' }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: 'WizardBottomBar' }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: '11111111-2222-4333-8444-555555555555' }),
  // The step is in focus for as long as it is mounted.
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (run: () => unknown) => run() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({
  deleteGRNImage: jest.fn(),
  generateTempGRNId: () => 'temp_grn_generated',
  uploadGRNItemImage: jest.fn(),
  validateImageFile: () => ({ valid: true }),
}));
jest.mock('@/utils/localPhotoFiles', () => ({ releaseLocalPhotos: jest.fn(async () => 0) }));

/** Ids shaped as the server's (the item form checks the item id). */
const lineId = (n: number) => `55555555-2222-4333-8444-${String(n).padStart(12, '0')}`;
const itemId = (n: number) => `66666666-2222-4333-8444-${String(n).padStart(12, '0')}`;
const NEW_ITEM_ID = '77777777-2222-4333-8444-555555555555';
const SAVED_PHOTO = 'bbbbbbbb-2222-4333-8444-555555555555';
const savedPhoto: GRNImageData = {
  id: SAVED_PHOTO,
  fileName: 'mark.webp',
  imageUrl: 'https://example.invalid/mark',
  storagePath: 'items/g/l/mark.webp',
  uploadStatus: 'completed',
};

/** Line n: quantity 10 + n, rack R(n mod 4), mark Mn. Line 5 is "Fictional item 5", 15, R1, M5. */
const line = (n: number, overrides: Partial<GRNItemData> = {}): GRNItemData => ({
  grn_trl_id: lineId(n),
  item_table_id: itemId(n % 9),
  item_name: `Fictional item ${n % 9}`,
  packaging: 'Bag',
  qty: 10 + n,
  stock: 10 + n,
  weight: 50,
  rack: `R${n % 4}`,
  package_mark: `M${n}`,
  trl_images: [],
  ...overrides,
});
const lines = (count: number, overrides: Record<number, Partial<GRNItemData>> = {}) =>
  Array.from({ length: count }, (_, index) => line(index + 1, overrides[index + 1]));

const ITEM_ACTIONS: string[] = [addItem.type, updateItem.type, reconcileItems.type, removeItem.type, restoreItemImages.type];
const itemActions = () => mockActions.filter((action) => ITEM_ACTIONS.includes(action.type));
const storedItems = () => mockStore.getState().grnForm.items;
/** The lines Next handed on to Review. */
const sentToReview = () => mockActions.find((action) => action.type === reconcileItems.type)?.payload as GRNItemData[] | undefined;
const wentToDetails = () => mockActions.some((action) => action.type === setCurrentStep.type && action.payload === 1);

const mounted: ReactTestRenderer[] = [];
async function render(mode: 'create' | 'edit', stored: GRNItemData[], backGuard?: React.RefObject<GrnItemsBackGuard | null>) {
  mockMode = mode;
  mockStore = makeStore();
  stored.forEach((item) => mockStore.dispatch(addItem(item)));
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GrnItemsStep mode={mode} backGuard={backGuard} />);
  });
  mounted.push(tree);
  mockActions.length = 0;
  return tree;
}

const form = (tree: ReactTestRenderer) => tree.root.findByType('HorizontalItemForm' as never);
const sheet = (tree: ReactTestRenderer) => tree.root.findByType('ItemsSummaryBottomSheet' as never);
const bar = (tree: ReactTestRenderer) => tree.root.findByType('WizardBottomBar' as never);
const indicator = (tree: ReactTestRenderer) => tree.root.findByType('GRNStepIndicator' as never);
/** What the form shows of its item. */
const inForm = (tree: ReactTestRenderer) => {
  const { currentItem, isEditing, editingItemNumber } = form(tree).props;
  return { id: currentItem.grn_trl_id, item: currentItem.item_table_id, qty: currentItem.qty, rack: currentItem.rack, mark: currentItem.package_mark, isEditing, editingItemNumber };
};

const set = (tree: ReactTestRenderer, field: string, value: string) =>
  act(() => form(tree).props.onFieldChange(field, value));
const pressNext = (tree: ReactTestRenderer) => act(async () => { await bar(tree).props.onNext(); });
/** A tap on saved item n in the saved-items sheet. */
const openRow = (tree: ReactTestRenderer, n: number) =>
  act(async () => { sheet(tree).props.onEditItem(sheet(tree).props.items[n - 1]); });
/** Saved item 5 in the form with quantity 99 and rack TEMP typed, not checkmarked. */
async function correctRowFive(tree: ReactTestRenderer) {
  await openRow(tree, 5);
  set(tree, 'qty', '99');
  set(tree, 'rack', 'TEMP');
}

const alerts = () => jest.mocked(Alert.alert).mock.calls;
const lastAlert = () => alerts().at(-1);
const buttonTexts = () => lastAlert()?.[2]?.map((button) => button.text);
/** Presses a button of the dialog shown last. */
async function answer(text: string) {
  const button = lastAlert()?.[2]?.find((candidate) => candidate.text === text);
  expect(button).toBeDefined();
  await act(async () => { await button!.onPress?.(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockActions.length = 0;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(require('react-native').Vibration, 'vibrate').mockImplementation(() => {});
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((run: FrameRequestCallback) => { run(0); return 0; });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  // A tree left mounted can log after the test run has ended.
  for (const tree of mounted.splice(0)) {
    await act(async () => { tree.unmount(); });
  }
  jest.mocked(router.back).mockReset();
  jest.restoreAllMocks();
  setLanguage('en');
});

describe('GRN items step, Next with a correction that was not checkmarked', () => {
  // Defect A: Next went on without a question and Review showed 15 and R1.
  it.each(['create', 'edit'] as const)('%s: asks before the item is left, and goes nowhere', async (mode) => {
    const tree = await render(mode, lines(10));
    await correctRowFive(tree);

    await pressNext(tree);

    expect(alerts()).toHaveLength(1);
    expect(lastAlert()?.[0]).toBe('Save changes to this item?');
    expect(lastAlert()?.[1]).toBe("Your changes to item 5 (Fictional item 5) haven't been saved yet.");
    expect(buttonTexts()).toEqual(['Keep editing', 'Discard changes', 'Save changes']);
    expect(router.push).not.toHaveBeenCalled();
    expect(itemActions()).toEqual([]);
  });

  it('asks in Gujarati: the position in its digits, the item name as it was typed', async () => {
    setLanguage('gu');
    const tree = await render('edit', lines(10));
    await correctRowFive(tree);

    await pressNext(tree);

    expect(lastAlert()?.[0]).toBe('આ આઇટમના ફેરફાર સાચવવા છે?');
    expect(lastAlert()?.[1]).toBe('આઇટમ ૫ (Fictional item 5) માં કરેલા ફેરફાર હજુ સાચવ્યા નથી.');
    expect(buttonTexts()).toEqual(['ફેરફાર ચાલુ રાખો', 'ફેરફાર છોડી દો', 'ફેરફાર સાચવો']);
  });

  it('Keep editing: the form still holds what was typed and nothing is stored', async () => {
    const tree = await render('edit', lines(10));
    const before = storedItems();
    await correctRowFive(tree);
    await pressNext(tree);

    await answer('Keep editing');

    expect(inForm(tree)).toMatchObject({ id: lineId(5), qty: '99', rack: 'TEMP', isEditing: true, editingItemNumber: 5 });
    expect(storedItems()).toBe(before);
    expect(router.push).not.toHaveBeenCalled();
    // The question is asked again the next time.
    await pressNext(tree);
    expect(alerts()).toHaveLength(2);
  });

  it('asks once: a second Next while the question is open does nothing, and closing it without a button lets it be asked again', async () => {
    const tree = await render('edit', lines(10));
    await correctRowFive(tree);

    await pressNext(tree);
    await pressNext(tree);
    expect(alerts()).toHaveLength(1);

    // Android Back or a tap beside the dialog.
    act(() => lastAlert()?.[3]?.onDismiss?.());
    await pressNext(tree);
    expect(alerts()).toHaveLength(2);
    expect(inForm(tree)).toMatchObject({ id: lineId(5), qty: '99', rack: 'TEMP' });
  });

  it('Discard changes: the stored items stay as they were, Review opens and the form is new', async () => {
    const tree = await render('edit', lines(10));
    const before = storedItems();
    await correctRowFive(tree);
    await pressNext(tree);

    await answer('Discard changes');

    expect(storedItems()).toBe(before);
    expect(sentToReview()?.map((item) => [item.qty, item.rack])).toEqual(before.map((item) => [item.qty, item.rack]));
    expect(router.push).toHaveBeenCalledWith(`/grn-edit/${GRN_ID}/step3`);
    expect(inForm(tree)).toMatchObject({ item: '', qty: '', mark: '', isEditing: false });
    expect(inForm(tree).id).toMatch(/^item-/);
  });

  it('Save changes: the item is stored as typed, Review gets it, and the other items keep their objects', async () => {
    const tree = await render('edit', lines(10));
    const before = storedItems();
    await correctRowFive(tree);
    await pressNext(tree);

    await answer('Save changes');

    const after = storedItems();
    expect(after).toHaveLength(10);
    expect(after[4]).toMatchObject({ grn_trl_id: lineId(5), qty: 99, stock: 99, rack: 'TEMP', package_mark: 'M5' });
    expect(sentToReview()).toHaveLength(10);
    expect(sentToReview()?.[4]).toMatchObject({ grn_trl_id: lineId(5), qty: 99, stock: 99, rack: 'TEMP' });
    after.forEach((item, index) => {
      if (index !== 4) expect(item).toBe(before[index]);
    });
    expect(itemActions().map((action) => action.type)).toEqual([updateItem.type, reconcileItems.type]);
    expect(router.push).toHaveBeenCalledWith(`/grn-edit/${GRN_ID}/step3`);
    expect(inForm(tree)).toMatchObject({ item: '', qty: '', isEditing: false });
  });

  it('edit: an item with dispatches keeps its stock and its locked quantity when its rack is corrected', async () => {
    const tree = await render('edit', lines(10, { 5: { qty: 100, stock: 60 } }));
    await openRow(tree, 5);
    expect(form(tree).props.isQtyLocked).toBe(true);
    set(tree, 'rack', 'NEW-RACK');
    await pressNext(tree);
    expect(lastAlert()?.[0]).toBe('Save changes to this item?');

    await answer('Save changes');

    expect(storedItems()[4]).toMatchObject({ grn_trl_id: lineId(5), qty: 100, stock: 60, rack: 'NEW-RACK' });
    expect(sentToReview()?.[4]).toMatchObject({ qty: 100, stock: 60, rack: 'NEW-RACK' });
    expect(router.push).toHaveBeenCalledWith(`/grn-edit/${GRN_ID}/step3`);
  });

  it('a correction that cannot be saved stays in the form, with its error and what was typed', async () => {
    const tree = await render('edit', lines(10));
    const before = storedItems();
    await openRow(tree, 5);
    set(tree, 'qty', '');
    set(tree, 'rack', 'TEMP');
    await pressNext(tree);

    await answer('Save changes');

    expect(lastAlert()?.[0]).toBe('Check the item details');
    expect(lastAlert()?.[1]).toBe('Fix the highlighted fields, then save the item.');
    expect(form(tree).props.currentItem.errors.qty).toEqual(expect.any(String));
    expect(inForm(tree)).toMatchObject({ id: lineId(5), qty: '', rack: 'TEMP', isEditing: true, editingItemNumber: 5 });
    expect(storedItems()).toBe(before);
    expect(itemActions()).toEqual([]);
    expect(router.push).not.toHaveBeenCalled();
    // Still a correction that was not checkmarked: it is asked about again.
    await pressNext(tree);
    expect(lastAlert()?.[0]).toBe('Save changes to this item?');
  });

  // The form is one sideways row: Weight, Rack and Mark are out of view while Item and Quantity are shown.
  it.each([
    ['a weight that is not a whole number', 'weight', '12.5'],
    ['a rack of more than 30 characters', 'rack', 'R'.repeat(31)],
    ['a mark of more than 60 characters', 'package_mark', 'M'.repeat(61)],
  ])('a correction with %s: OK on the refusal brings that field into view', async (_what, field, value) => {
    const tree = await render('edit', lines(10));
    await openRow(tree, 5);
    set(tree, field, value);
    await pressNext(tree);

    await answer('Save changes');
    expect(lastAlert()?.[1]).toBe('Fix the highlighted fields, then save the item.');
    expect(Object.keys(form(tree).props.currentItem.errors)).toEqual([field]);
    expect(mockFormRef.revealField).not.toHaveBeenCalled();
    await answer('OK');

    expect(mockFormRef.revealField).toHaveBeenCalledTimes(1);
    expect(mockFormRef.revealField).toHaveBeenCalledWith(field);
    expect(mockFormRef.focusQty).not.toHaveBeenCalled();
    expect(mockFormRef.resetScroll).not.toHaveBeenCalled();
  });

  it('with several fields wrong, the first of the row is the one brought into view', async () => {
    const tree = await render('edit', lines(10));
    await openRow(tree, 5);
    set(tree, 'rack', 'R'.repeat(31));
    set(tree, 'weight', '12.5');
    await pressNext(tree);
    await answer('Save changes');
    await answer('OK');

    // Weight is drawn before Rack.
    expect(mockFormRef.revealField.mock.calls).toEqual([['weight']]);

    // Quantity is drawn before both, and is given the cursor as before.
    set(tree, 'qty', '');
    await pressNext(tree);
    await answer('Save changes');
    await answer('OK');

    expect(mockFormRef.focusQty).toHaveBeenCalledTimes(1);
    expect(mockFormRef.revealField.mock.calls).toEqual([['weight']]);
    expect(mockFormRef.resetScroll).not.toHaveBeenCalled();
  });

  it('a saved item that was opened and not changed is not asked about: the form closes and Review opens', async () => {
    const tree = await render('edit', lines(10));
    const before = storedItems();
    await openRow(tree, 5);
    expect(inForm(tree)).toMatchObject({ id: lineId(5), isEditing: true });

    await pressNext(tree);

    expect(alerts()).toHaveLength(0);
    expect(storedItems()).toBe(before);
    expect(router.push).toHaveBeenCalledWith(`/grn-edit/${GRN_ID}/step3`);
    expect(inForm(tree)).toMatchObject({ item: '', qty: '', isEditing: false });
  });
});

describe('GRN items step, Next with a new item that was not checkmarked', () => {
  // Defect B: the discarded line was checked and stored, so Review showed ten items.
  it('Discard item: nine saved items and a complete tenth give nine in the store and nine for Review', async () => {
    const tree = await render('create', lines(9));
    const before = storedItems();
    set(tree, 'item_table_id', NEW_ITEM_ID);
    set(tree, 'item_name', 'Fictional garlic');
    set(tree, 'qty', '7');
    await pressNext(tree);
    expect(lastAlert()?.[0]).toBe('Save this item?');
    expect(buttonTexts()).toEqual(['Keep editing', 'Discard item', 'Save item']);

    await answer('Discard item');

    expect(storedItems()).toHaveLength(9);
    expect(storedItems()).toBe(before);
    expect(sentToReview()).toHaveLength(9);
    expect(sentToReview()?.some((item) => item.item_table_id === NEW_ITEM_ID)).toBe(false);
    expect(itemActions().map((action) => action.type)).toEqual([reconcileItems.type]);
    expect(router.push).toHaveBeenCalledWith('/grn-form/step3');
    expect(inForm(tree)).toMatchObject({ item: '', qty: '', isEditing: false });
  });

  it('Discard item with nothing saved stays on the step: a GRN needs an item', async () => {
    const tree = await render('create', []);
    set(tree, 'item_table_id', NEW_ITEM_ID);
    set(tree, 'item_name', 'Fictional garlic');
    set(tree, 'qty', '7');
    await pressNext(tree);

    await answer('Discard item');

    expect(lastAlert()?.[0]).toBe('Add an item');
    expect(storedItems()).toEqual([]);
    expect(itemActions()).toEqual([]);
    expect(router.push).not.toHaveBeenCalled();
    expect(inForm(tree)).toMatchObject({ item: '', qty: '' });
  });

  // Before, a part-filled item was dropped without a word.
  it.each([
    ['a mark', 'package_mark', 'HALF'],
    ['a quantity', 'qty', '7'],
    ['an item', 'item_table_id', NEW_ITEM_ID],
    ['a changed rack', 'rack', 'OTHER'],
  ])('a new item with only %s typed is asked about; Save item refuses it and keeps what was typed', async (_what, field, value) => {
    const tree = await render('create', lines(3));
    const before = storedItems();
    set(tree, field, value);

    await pressNext(tree);
    expect(lastAlert()?.[0]).toBe('Save this item?');
    expect(lastAlert()?.[1]).toBe("The item you're adding hasn't been saved yet.");
    expect(router.push).not.toHaveBeenCalled();

    await answer('Save item');

    expect(lastAlert()?.[0]).toBe('Check the item details');
    expect(form(tree).props.currentItem[field]).toBe(value);
    expect(Object.keys(form(tree).props.currentItem.errors).length).toBeGreaterThan(0);
    expect(storedItems()).toBe(before);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('a new form that only holds the rack of the first saved item is not asked about', async () => {
    const tree = await render('create', lines(3));
    expect(inForm(tree)).toMatchObject({ rack: 'R1', item: '', qty: '' });

    await pressNext(tree);

    expect(alerts()).toHaveLength(0);
    expect(router.push).toHaveBeenCalledWith('/grn-form/step3');
  });
});

describe('GRN items step, going back to Details with a correction that was not checkmarked', () => {
  type WayBack = {
    backGuard?: React.RefObject<GrnItemsBackGuard | null>;
    press: (tree: ReactTestRenderer, leave: () => void) => void;
  };
  /** The three ways back. The Back key hands the step what leaving does; the other two go one step back. */
  const waysBack: [string, () => WayBack][] = [
    ['footer Back', () => ({ press: (tree) => bar(tree).props.onPrevious() })],
    ['the Details step circle', () => ({ press: (tree) => indicator(tree).props.onStepPress(1) })],
    ['the phone\'s Back key', () => {
      const backGuard: React.RefObject<GrnItemsBackGuard | null> = { current: null };
      return { backGuard, press: (_tree, leave) => backGuard.current!(leave) };
    }],
  ];

  /**
   * How the step was left. The Back key's route hands the step what leaving
   * does, and only that may be used; the other two go one step back in the stack.
   */
  const NOT_LEFT = { byRouteLeave: 0, byRouterBack: 0 };
  const leftOnce = (way: WayBack) => (way.backGuard ? { byRouteLeave: 1, byRouterBack: 0 } : { byRouteLeave: 0, byRouterBack: 1 });

  async function setUp(way: WayBack, type: (tree: ReactTestRenderer) => Promise<void> | void = correctRowFive) {
    const tree = await render('edit', lines(10), way.backGuard);
    const before = storedItems();
    await type(tree);
    // What the store held for item 5 at the moment the step was left.
    let quantityWhenLeft: number | undefined;
    const record = () => { quantityWhenLeft = storedItems()[4].qty; };
    const routeLeave = jest.fn(record);
    jest.mocked(router.back).mockImplementation(record);
    await act(async () => { way.press(tree, routeLeave); });
    const left = () => ({ byRouteLeave: routeLeave.mock.calls.length, byRouterBack: jest.mocked(router.back).mock.calls.length });
    return { tree, before, left, quantityWhenLeft: () => quantityWhenLeft };
  }

  it.each(waysBack)('%s asks, and goes nowhere until it is answered', async (_name, makeWay) => {
    const { tree, left } = await setUp(makeWay());

    expect(lastAlert()?.[0]).toBe('Save changes to this item?');
    expect(buttonTexts()).toEqual(['Keep editing', 'Discard changes', 'Save changes']);
    expect(left()).toEqual(NOT_LEFT);
    expect(wentToDetails()).toBe(false);

    await answer('Keep editing');
    expect(left()).toEqual(NOT_LEFT);
    expect(inForm(tree)).toMatchObject({ id: lineId(5), qty: '99', rack: 'TEMP' });
  });

  it.each(waysBack)('%s, Discard changes: goes to Details and stores nothing', async (_name, makeWay) => {
    const way = makeWay();
    const { before, left } = await setUp(way);

    await answer('Discard changes');

    expect(storedItems()).toBe(before);
    expect(itemActions()).toEqual([]);
    expect(wentToDetails()).toBe(true);
    expect(left()).toEqual(leftOnce(way));
  });

  it.each(waysBack)('%s, Save changes: stores the item first, then goes to Details', async (_name, makeWay) => {
    const way = makeWay();
    const { left, quantityWhenLeft } = await setUp(way);

    await answer('Save changes');

    expect(itemActions().map((action) => action.type)).toEqual([updateItem.type]);
    expect(storedItems()[4]).toMatchObject({ qty: 99, stock: 99, rack: 'TEMP' });
    expect(wentToDetails()).toBe(true);
    expect(left()).toEqual(leftOnce(way));
    expect(quantityWhenLeft()).toBe(99);
  });

  it.each(waysBack)('%s, Save changes on a correction that cannot be saved: stays on the step', async (_name, makeWay) => {
    const { tree, before, left } = await setUp(makeWay(), async (step) => {
      await openRow(step, 5);
      set(step, 'qty', '0');
      set(step, 'rack', 'TEMP');
    });

    await answer('Save changes');

    expect(lastAlert()?.[0]).toBe('Check the item details');
    expect(form(tree).props.currentItem.errors.qty).toEqual(expect.any(String));
    expect(inForm(tree)).toMatchObject({ id: lineId(5), qty: '0', rack: 'TEMP', isEditing: true });
    expect(storedItems()).toBe(before);
    expect(wentToDetails()).toBe(false);
    expect(left()).toEqual(NOT_LEFT);
  });

  it.each(waysBack)('%s with nothing typed goes to Details at once', async (_name, makeWay) => {
    const way = makeWay();
    const { left } = await setUp(way, () => {});

    expect(alerts()).toHaveLength(0);
    expect(wentToDetails()).toBe(true);
    expect(left()).toEqual(leftOnce(way));
  });

  it.each(waysBack)('%s with a new item that was typed asks about it, and Discard item goes to Details', async (_name, makeWay) => {
    const way = makeWay();
    const { before, left } = await setUp(way, (step) => {
      set(step, 'item_table_id', NEW_ITEM_ID);
      set(step, 'item_name', 'Fictional garlic');
      set(step, 'qty', '7');
    });
    expect(lastAlert()?.[0]).toBe('Save this item?');
    expect(left()).toEqual(NOT_LEFT);

    await answer('Discard item');

    expect(storedItems()).toBe(before);
    expect(wentToDetails()).toBe(true);
    expect(left()).toEqual(leftOnce(way));
  });

  it('takes its guard off the route when the step goes away', async () => {
    const backGuard: React.RefObject<GrnItemsBackGuard | null> = { current: null };
    const tree = await render('create', lines(2), backGuard);
    expect(backGuard.current).toEqual(expect.any(Function));

    await act(async () => { tree.unmount(); });
    mounted.length = 0;

    expect(backGuard.current).toBeNull();
  });
});

describe('GRN items step, opening another saved item with an item in the form', () => {
  it('asks, and the form still holds the item that was being corrected', async () => {
    const tree = await render('edit', lines(10));
    await correctRowFive(tree);

    await openRow(tree, 2);

    expect(lastAlert()?.[0]).toBe('Save changes to this item?');
    expect(inForm(tree)).toMatchObject({ id: lineId(5), qty: '99', rack: 'TEMP', isEditing: true, editingItemNumber: 5 });
    expect(itemActions()).toEqual([]);
  });

  it('Save changes: the corrected item is stored and the other one is in the form', async () => {
    const tree = await render('edit', lines(10));
    await correctRowFive(tree);
    await openRow(tree, 2);

    await answer('Save changes');

    expect(storedItems()[4]).toMatchObject({ grn_trl_id: lineId(5), qty: 99, rack: 'TEMP' });
    expect(itemActions().map((action) => action.type)).toEqual([updateItem.type]);
    expect(inForm(tree)).toEqual({ id: lineId(2), item: itemId(2), qty: '12', rack: 'R2', mark: 'M2', isEditing: true, editingItemNumber: 2 });
    expect(router.push).not.toHaveBeenCalled();
    // The item now in the form was not changed: Next asks nothing.
    await pressNext(tree);
    expect(alerts()).toHaveLength(1);
  });

  it('Discard changes: nothing is stored and the other one is in the form', async () => {
    const tree = await render('edit', lines(10));
    const before = storedItems();
    await correctRowFive(tree);
    await openRow(tree, 2);

    await answer('Discard changes');

    expect(storedItems()).toBe(before);
    expect(itemActions()).toEqual([]);
    expect(inForm(tree)).toEqual({ id: lineId(2), item: itemId(2), qty: '12', rack: 'R2', mark: 'M2', isEditing: true, editingItemNumber: 2 });
    // Item 5 is shown in the list with its stored values.
    expect(sheet(tree).props.items[4]).toMatchObject({ grn_trl_id: lineId(5), qty: '15', rack: 'R1' });
  });

  it('Keep editing: the item that was being corrected stays in the form', async () => {
    const tree = await render('edit', lines(10));
    const before = storedItems();
    await correctRowFive(tree);
    await openRow(tree, 2);

    await answer('Keep editing');

    expect(inForm(tree)).toMatchObject({ id: lineId(5), qty: '99', rack: 'TEMP', isEditing: true, editingItemNumber: 5 });
    expect(storedItems()).toBe(before);
  });

  it('a tap on the item that is already in the form does nothing', async () => {
    const tree = await render('edit', lines(10));
    await correctRowFive(tree);

    await openRow(tree, 5);

    expect(alerts()).toHaveLength(0);
    expect(inForm(tree)).toMatchObject({ id: lineId(5), qty: '99', rack: 'TEMP', isEditing: true });
  });

  it('a new item that was typed is asked about too, and Save item stores it before the saved one is opened', async () => {
    const tree = await render('create', lines(3));
    set(tree, 'item_table_id', NEW_ITEM_ID);
    set(tree, 'item_name', 'Fictional garlic');
    set(tree, 'qty', '7');

    await openRow(tree, 2);
    expect(lastAlert()?.[0]).toBe('Save this item?');
    await answer('Save item');

    expect(storedItems()).toHaveLength(4);
    expect(storedItems()[3]).toMatchObject({ item_table_id: NEW_ITEM_ID, qty: 7, stock: 7 });
    expect(inForm(tree)).toMatchObject({ id: lineId(2), qty: '12', isEditing: true, editingItemNumber: 2 });
  });

  it('with nothing typed the saved item opens at once', async () => {
    const tree = await render('edit', lines(10));

    await openRow(tree, 2);

    expect(alerts()).toHaveLength(0);
    expect(inForm(tree)).toMatchObject({ id: lineId(2), qty: '12', isEditing: true, editingItemNumber: 2 });
  });
});

describe('GRN items step, photos of an item that is left', () => {
  const pickedPhoto = () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///camera/raw.jpg', fileName: 'raw.jpg', fileSize: 5000, mimeType: 'image/jpeg' }],
    });
    (uploadGRNItemImage as jest.Mock).mockResolvedValue({
      success: true,
      imageId: undefined,
      imageUrl: 'file:///cache/prepared.webp',
      metadata: { fileName: 'raw.webp', fileSize: 1200, mimeType: 'image/webp', uploadTimestamp: '2026-10-10T08:00:00.000Z', storagePath: undefined },
    });
  };
  /** The camera button of the form, then "Choose from gallery". */
  async function pickFromGallery(tree: ReactTestRenderer) {
    act(() => form(tree).props.onImagePick());
    await answer('Choose from gallery');
  }
  const removedImages = () => mockStore.getState().grnForm.removedImages;

  // A photo taken off a saved item reaches the store at once and waits to be deleted when the GRN is saved.
  it('Discard changes puts a removed saved photo back, and the save no longer deletes it', async () => {
    const tree = await render('edit', lines(10, { 5: { trl_images: [savedPhoto] } }));
    await openRow(tree, 5);
    await act(async () => { await form(tree).props.onImageRemove(SAVED_PHOTO); });
    expect(storedItems()[4].trl_images).toEqual([]);
    expect(removedImages()).toEqual([{ id: SAVED_PHOTO, storagePath: 'items/g/l/mark.webp' }]);

    await pressNext(tree);
    expect(lastAlert()?.[0]).toBe('Save changes to this item?');
    await answer('Discard changes');

    expect(storedItems()[4].trl_images).toEqual([savedPhoto]);
    expect(removedImages()).toEqual([]);
    expect(sentToReview()?.[4].trl_images).toEqual([savedPhoto]);
    expect(sheet(tree).props.items[4].trl_images).toEqual([savedPhoto]);
    expect(releaseLocalPhotos).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith(`/grn-edit/${GRN_ID}/step3`);
  });

  it('Save changes keeps the photo removed, for the save to delete', async () => {
    const tree = await render('edit', lines(10, { 5: { trl_images: [savedPhoto] } }));
    await openRow(tree, 5);
    await act(async () => { await form(tree).props.onImageRemove(SAVED_PHOTO); });
    await pressNext(tree);

    await answer('Save changes');

    expect(storedItems()[4].trl_images).toEqual([]);
    expect(removedImages()).toEqual([{ id: SAVED_PHOTO, storagePath: 'items/g/l/mark.webp' }]);
    expect(sentToReview()?.[4].trl_images).toEqual([]);
  });

  it('Discard changes takes a photo picked for a saved item out again and releases its file', async () => {
    pickedPhoto();
    const tree = await render('edit', lines(10, { 5: { trl_images: [savedPhoto] } }));
    await openRow(tree, 5);
    await pickFromGallery(tree);
    expect(storedItems()[4].trl_images).toHaveLength(2);

    await pressNext(tree);
    expect(lastAlert()?.[0]).toBe('Save changes to this item?');
    await answer('Discard changes');

    expect(storedItems()[4].trl_images).toEqual([savedPhoto]);
    expect(sentToReview()?.[4].trl_images).toEqual([savedPhoto]);
    expect(releaseLocalPhotos).toHaveBeenCalledTimes(1);
    expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/prepared.webp']);
  });

  // In a new GRN every photo is still a file on the phone: it is uploaded when the GRN is saved.
  const earlierPhoto: GRNImageData = { id: 'temp_100', fileName: 'earlier.webp', imageUrl: 'file:///cache/earlier.webp', uploadStatus: 'completed' };

  it('a photo the saved item already had keeps its file while its removal can still be discarded', async () => {
    const tree = await render('create', lines(3, { 2: { trl_images: [earlierPhoto] } }));
    await openRow(tree, 2);

    await act(async () => { await form(tree).props.onImageRemove(earlierPhoto.id); });
    expect(storedItems()[1].trl_images).toEqual([]);
    expect(releaseLocalPhotos).not.toHaveBeenCalled();

    await pressNext(tree);
    await answer('Discard changes');

    expect(storedItems()[1].trl_images).toEqual([earlierPhoto]);
    expect(sentToReview()?.[1].trl_images).toEqual([earlierPhoto]);
    expect(releaseLocalPhotos).not.toHaveBeenCalled();
  });

  it.each([
    ['Save changes in the question', async (tree: ReactTestRenderer) => { await pressNext(tree); await answer('Save changes'); }],
    ['the checkmark', async (tree: ReactTestRenderer) => { await act(async () => { await form(tree).props.onSaveItem(); }); }],
  ])('a photo the saved item already had: %s makes its removal final and releases its file', async (_how, save) => {
    const tree = await render('create', lines(3, { 2: { trl_images: [earlierPhoto] } }));
    await openRow(tree, 2);
    await act(async () => { await form(tree).props.onImageRemove(earlierPhoto.id); });

    await save(tree);

    expect(storedItems()[1].trl_images).toEqual([]);
    expect(releaseLocalPhotos).toHaveBeenCalledTimes(1);
    expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/earlier.webp']);
  });

  it('a new item with only a photo is asked about, and Discard item releases the photo\'s file', async () => {
    pickedPhoto();
    const tree = await render('create', lines(3));
    const before = storedItems();
    await pickFromGallery(tree);
    expect(form(tree).props.currentItem.trl_images).toHaveLength(1);

    await pressNext(tree);
    expect(lastAlert()?.[0]).toBe('Save this item?');
    await answer('Discard item');

    expect(storedItems()).toBe(before);
    expect(form(tree).props.currentItem.trl_images).toEqual([]);
    expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/prepared.webp']);
    expect(router.push).toHaveBeenCalledWith('/grn-form/step3');
  });
});

describe('GRN items step, deleting a saved item while a new one is being typed', () => {
  // The stored lines changed, and the step put a new, empty item into the form.
  it.each([
    ['one of three saved items', 3, 2, 2],
    ['the only saved item', 1, 1, 0],
  ])('deleting %s keeps what was typed', async (_what, saved, deleted, left) => {
    const tree = await render('create', lines(saved));
    set(tree, 'item_table_id', NEW_ITEM_ID);
    set(tree, 'item_name', 'Fictional garlic');
    set(tree, 'package_mark', 'HALF');
    const typed = inForm(tree);

    await act(async () => { sheet(tree).props.onRemoveItem(lineId(deleted)); });

    expect(storedItems()).toHaveLength(left);
    expect(form(tree).props.savedItemsCount).toBe(left);
    expect(inForm(tree)).toEqual(typed);
    expect(form(tree).props.currentItem.item_name).toBe('Fictional garlic');
  });

  it('deleting the saved item that is being corrected closes the form', async () => {
    const tree = await render('edit', lines(3));
    await openRow(tree, 2);
    set(tree, 'qty', '99');

    await act(async () => { sheet(tree).props.onRemoveItem(lineId(2)); });

    expect(storedItems().map((item) => item.grn_trl_id)).toEqual([lineId(1), lineId(3)]);
    expect(inForm(tree)).toMatchObject({ item: '', qty: '', isEditing: false });
    // Nothing is open any more: Next asks nothing.
    await pressNext(tree);
    expect(alerts()).toHaveLength(0);
    expect(router.push).toHaveBeenCalledWith(`/grn-edit/${GRN_ID}/step3`);
  });
});
