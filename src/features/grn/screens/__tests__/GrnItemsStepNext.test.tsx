/**
 * "Next" on the GRN items step stores the step's lines. It did that with one
 * `items.find` and one `updateItem` per line, and the reducer wrote a new object
 * for every line even when nothing had changed: 500 unchanged lines were 500
 * actions and 500 new objects (review follow-up P2F-FORM-1). Now it is one
 * action, and a line that did not change keeps its stored object.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
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
// Children are stand-ins that draw what the step hands them (the item form's fields and Save, the saved lines with
// their Edit and Remove, the bar's Next) and call the real props, so the test taps them.
jest.mock('@/features/grn/components/HorizontalItemForm', () => ({
  HorizontalItemForm: require('react').forwardRef((props: {
    currentItem: Record<string, unknown>;
    onFieldChange: (field: string, value: string) => void;
    onSaveItem: () => unknown;
  }, _ref: unknown) => {
    const { Pressable, TextInput, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      null,
      ['item_table_id', 'item_name', 'qty', 'rack'].map((field) =>
        createElement(TextInput, {
          key: field,
          accessibilityLabel: field,
          value: String(props.currentItem[field] ?? ''),
          onChangeText: (value: string) => props.onFieldChange(field, value),
        })),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Save line', onPress: props.onSaveItem })
    );
  }),
}));
jest.mock('@/features/grn/components/ItemsSummaryBottomSheet', () => ({
  __esModule: true,
  default: (props: { items: { grn_trl_id: string }[]; onEditItem: (item: unknown) => void; onRemoveItem: (id: string) => void }) => {
    const { Pressable, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      null,
      props.items.map((item) => createElement(
        View,
        { key: item.grn_trl_id },
        createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: `Edit ${item.grn_trl_id}`, onPress: () => props.onEditItem(item) }),
        createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: `Remove ${item.grn_trl_id}`, onPress: () => props.onRemoveItem(item.grn_trl_id) })
      ))
    );
  },
}));
jest.mock('@/components/WizardBottomBar', () => ({
  __esModule: true,
  default: (props: { onNext: () => unknown }) =>
    require('react').createElement(require('react-native').Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Next', onPress: props.onNext }),
}));
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

const user = userEvent.setup({ delay: 0 });

async function show(mode: 'create' | 'edit', lines: GRNItemData[]) {
  mockMode = mode;
  mockStore = makeStore();
  lines.forEach((item) => mockStore.dispatch(addItem(item)));
  await render(<GrnItemsStep mode={mode} />);
  mockActions.length = 0;
}
const pressNext = () => user.press(screen.getByRole('button', { name: 'Next' }));
const press = (name: string) => user.press(screen.getByRole('button', { name }));
/** Replaces what is in the field of the item form with `value` (pasted, so spaces at the ends arrive as typed). */
const set = async (field: string, value: string) => {
  const input = screen.getByLabelText(field);
  await user.clear(input);
  await user.paste(input, value);
};

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
    await show(mode, lines);
    const before = storedItems();
    expect(before).toHaveLength(500);

    await pressNext();

    expect(itemActions()).toHaveLength(1);
    expect(itemActions()[0].type).toBe(reconcileItems.type);
    expect(storedItems()).toBe(before);
    storedItems().forEach((item, index) => expect(item).toBe(before[index]));
    expect(router.push).toHaveBeenCalledWith(mode === 'edit' ? `/grn-edit/${GRN_ID}/step3` : '/grn-form/step3');
  });

  it('edit: an edited, a deleted and a new line give the same lines as before, with the stock rules', async () => {
    const lines = [
      line(1),
      line(2, { qty: 100, stock: 60 }), // has dispatches: its stock stays
      line(3),
      line(4, { trl_images: [{ id: 'img-1', fileName: 'a.webp', imageUrl: 'https://example.test/a.webp', uploadStatus: 'completed' }] }),
    ];
    await show('edit', lines);

    // Edit line 1 (quantity 11 → 15) and save it.
    await press(`Edit ${lineId(1)}`);
    await set('qty', '15');
    await press('Save line');
    // Delete line 3.
    await press(`Remove ${lineId(3)}`);
    // Type a new line and go on without saving it.
    await set('item_table_id', NEW_ITEM_ID);
    await set('item_name', 'Fictional garlic');
    await set('qty', '7');
    await set('rack', ' R9 ');
    const beforeNext = storedItems();
    mockActions.length = 0;

    await pressNext();
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
  });

  it('still stops a GRN without lines, and stores nothing', async () => {
    await show('create', []);

    await pressNext();

    expect(itemActions()).toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
    expect(jest.mocked(Alert.alert).mock.calls.at(-1)?.[0]).toBe('Add an item');
  });
});
