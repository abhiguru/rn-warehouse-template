/**
 * "Next" on the GRN items step stores the step's lines. It did that with one
 * `items.find` and one `updateItem` per line, and the reducer wrote a new object
 * for every line even when nothing had changed: 500 unchanged lines were 500
 * actions and 500 new objects (review follow-up P2F-FORM-1). Now it is one
 * action, and a line that did not change keeps its stored object.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { configureStore, type UnknownAction } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import { GrnItemsStep } from '@/features/grn/screens/GrnItemsStep';
import grnFormReducer, { addItem, reconcileItems, removeItem, updateItem, type GRNItemData } from '@/store/slices/grnFormSlice';

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
jest.mock('@/features/grn/components/HorizontalItemForm', () => ({
  HorizontalItemForm: require('react').forwardRef((props: object, _ref: unknown) =>
    require('react').createElement('HorizontalItemForm', props)),
}));
jest.mock('@/features/grn/components/ItemsSummaryBottomSheet', () => ({ __esModule: true, default: 'ItemsSummaryBottomSheet' }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: 'WizardBottomBar' }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: () => null }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: '11111111-2222-4333-8444-555555555555' }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (run: () => unknown) => run() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({
  deleteGRNImage: jest.fn(),
  generateTempGRNId: () => 'temp_grn_generated',
  uploadGRNItemImage: jest.fn(),
  validateImageFile: () => ({ valid: true }),
}));

/** Ids shaped as the server's (the item form checks the item id). */
const lineId = (n: number) => `55555555-2222-4333-8444-${String(n).padStart(12, '0')}`;
const itemId = (n: number) => `66666666-2222-4333-8444-${String(n).padStart(12, '0')}`;
const NEW_ITEM_ID = '77777777-2222-4333-8444-555555555555';

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

const ITEM_ACTIONS: string[] = [addItem.type, updateItem.type, reconcileItems.type, removeItem.type];
const itemActions = () => mockActions.filter((action) => ITEM_ACTIONS.includes(action.type));
const storedItems = () => mockStore.getState().grnForm.items;

async function render(mode: 'create' | 'edit', lines: GRNItemData[]) {
  mockMode = mode;
  mockStore = makeStore();
  lines.forEach((item) => mockStore.dispatch(addItem(item)));
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GrnItemsStep mode={mode} />);
  });
  mockActions.length = 0;
  return tree;
}
const pressNext = (tree: ReactTestRenderer) =>
  act(async () => { await tree.root.findByType('WizardBottomBar' as never).props.onNext(); });
const form = (tree: ReactTestRenderer) => tree.root.findByType('HorizontalItemForm' as never);
const sheet = (tree: ReactTestRenderer) => tree.root.findByType('ItemsSummaryBottomSheet' as never);
const set = (tree: ReactTestRenderer, field: string, value: string) =>
  act(() => form(tree).props.onFieldChange(field, value));

beforeEach(() => {
  jest.clearAllMocks();
  mockActions.length = 0;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(require('react-native').Vibration, 'vibrate').mockImplementation(() => {});
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((run: FrameRequestCallback) => { run(0); return 0; });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GRN items step, Next', () => {
  it.each(['create', 'edit'] as const)('%s: 500 unchanged lines are stored with one action and keep their objects', async (mode) => {
    // In an edit, every seventh line has dispatches (its stock is below its quantity).
    const lines = Array.from({ length: 500 }, (_, n) => line(n, mode === 'edit' && n % 7 === 0 ? { stock: 3 } : {}));
    const tree = await render(mode, lines);
    const before = storedItems();
    expect(before).toHaveLength(500);

    await pressNext(tree);

    expect(itemActions()).toHaveLength(1);
    expect(itemActions()[0].type).toBe(reconcileItems.type);
    expect(storedItems()).toBe(before);
    storedItems().forEach((item, index) => expect(item).toBe(before[index]));
    expect(router.push).toHaveBeenCalledWith(mode === 'edit' ? `/grn-edit/${GRN_ID}/step3` : '/grn-form/step3');
    await act(async () => { tree.unmount(); });
  });

  it('edit: an edited, a deleted and a new line give the same lines as before, with the stock rules', async () => {
    const lines = [
      line(1),
      line(2, { qty: 100, stock: 60 }), // has dispatches: its stock stays
      line(3),
      line(4, { trl_images: [{ id: 'img-1', fileName: 'a.webp', imageUrl: 'https://example.test/a.webp', uploadStatus: 'completed' }] }),
    ];
    const tree = await render('edit', lines);

    // Edit line 1 (quantity 11 → 15) and save it.
    await act(async () => { sheet(tree).props.onEditItem(sheet(tree).props.items[0]); });
    set(tree, 'qty', '15');
    await act(async () => { await form(tree).props.onSaveItem(); });
    // Delete line 3.
    await act(async () => { sheet(tree).props.onRemoveItem(lineId(3)); });
    // Type a new line and go on without saving it.
    set(tree, 'item_table_id', NEW_ITEM_ID);
    set(tree, 'item_name', 'Fictional garlic');
    set(tree, 'qty', '7');
    set(tree, 'rack', ' R9 ');
    const beforeNext = storedItems();
    mockActions.length = 0;

    await pressNext(tree);
    // "Save this item first?" is asked for the typed line; the answer "Save item" goes on with it.
    const save = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find((button) => button.text === 'Save item');
    expect(save).toBeDefined();
    await act(async () => { await save!.onPress!(); });

    const after = storedItems();
    expect(after.map((item) => [item.grn_trl_id, item.qty, item.stock, item.rack])).toEqual([
      [lineId(1), 15, 15, 'R1'],
      [lineId(2), 100, 60, 'R2'],
      [lineId(4), 14, 14, 'R0'],
      [expect.any(String), 7, 7, 'R9'],
    ]);
    expect(after[3]).toMatchObject({ item_table_id: NEW_ITEM_ID, item_name: 'Fictional garlic', weight: 0, trl_images: [] });
    // The lines that Next did not change keep their objects.
    expect(after[0]).toBe(beforeNext[0]);
    expect(after[1]).toBe(beforeNext[1]);
    expect(after[2]).toBe(beforeNext[2]);
    // "Save item" stores the typed line as the checkmark does, then Next stores the step's lines in one action.
    expect(itemActions().map((action) => action.type)).toEqual([addItem.type, reconcileItems.type]);
    expect(router.push).toHaveBeenCalledWith(`/grn-edit/${GRN_ID}/step3`);
    await act(async () => { tree.unmount(); });
  });

  it('still stops a GRN without lines, and stores nothing', async () => {
    const tree = await render('create', []);

    await pressNext(tree);

    expect(itemActions()).toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
    expect(jest.mocked(Alert.alert).mock.calls.at(-1)?.[0]).toBe('Add an item');
    await act(async () => { tree.unmount(); });
  });
});
