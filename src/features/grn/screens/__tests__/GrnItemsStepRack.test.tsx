/**
 * Racks on the GRN items step (owner decision of 2026-10-11): any text is
 * taken, in a new GRN and in an edit, for a new line and for a line that was
 * stored with a rack such as "C3" before.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { GrnItemsStep } from '@/features/grn/screens/GrnItemsStep';
import { addItem, reconcileItems, updateItem } from '@/store/slices/grnFormSlice';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const LINE_ID = '55555555-2222-4333-8444-555555555555';
const ITEM_ID = '66666666-2222-4333-8444-555555555555';

const mockDispatch = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: [] } }),
}));

const storedLine = (rack: string) => ({
  grn_trl_id: LINE_ID,
  item_table_id: ITEM_ID,
  item_name: 'Example Potatoes',
  packaging: 'Bag',
  qty: 10,
  stock: 10,
  weight: 50,
  rack,
  package_mark: '',
  trl_images: [],
});
const mockForm: Record<string, unknown> = {};
jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));

// Children are stand-ins that draw what the step hands them (the item form's fields, its Save and rack error, the
// saved lines with their Edit, the bar's Next) and call the real props, so the test taps them.
jest.mock('@/features/grn/components/HorizontalItemForm', () => ({
  HorizontalItemForm: require('react').forwardRef((props: {
    currentItem: Record<string, unknown> & { errors?: { rack?: string } };
    onFieldChange: (field: string, value: string) => void;
    onSaveItem: () => unknown;
    isValid: boolean;
  }, _ref: unknown) => {
    const { Pressable, Text, TextInput, View } = require('react-native');
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
      // The form's Save is held back by an invalid line (what `isValid` is for).
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Save line', disabled: !props.isValid, onPress: props.onSaveItem }),
      props.currentItem.errors?.rack ? createElement(Text, null, props.currentItem.errors.rack) : null
    );
  }),
}));
jest.mock('@/features/grn/components/ItemsSummaryBottomSheet', () => ({
  __esModule: true,
  default: (props: { items: { grn_trl_id: string; rack: string }[]; onEditItem: (item: unknown) => void }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      null,
      props.items.map((item) => createElement(
        View,
        { key: item.grn_trl_id },
        createElement(Text, null, `Saved rack: ${item.rack}`),
        createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: `Edit ${item.grn_trl_id}`, onPress: () => props.onEditItem(item) })
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

function useForm(mode: 'create' | 'edit', items: ReturnType<typeof storedLine>[]) {
  Object.assign(mockForm, {
    header: { gr_no: 'A0010' },
    items,
    grnId: mode === 'edit' ? GRN_ID : null,
    tempGrnId: null,
    isCreateMode: mode === 'create',
    resetFormState: jest.fn(),
  });
}

const user = userEvent.setup({ delay: 0 });

const show = (mode: 'create' | 'edit') => render(<GrnItemsStep mode={mode} />);
const press = (name: string) => user.press(screen.getByRole('button', { name }));
/** Replaces what is in the field of the item form with `value` (pasted, so spaces at the ends arrive as typed). */
const set = async (field: string, value: string) => {
  const input = screen.getByLabelText(field);
  await user.clear(input);
  if (value) await user.paste(input, value);
};

async function typeLine(rack: string) {
  await set('item_table_id', ITEM_ID);
  await set('item_name', 'Example Potatoes');
  await set('qty', '10');
  await set('rack', rack);
}

describe('GRN items step racks', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(require('react-native').Vibration, 'vibrate').mockImplementation(() => {});
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((run: FrameRequestCallback) => { run(0); return 0; });
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['C3', 'C3'],
    ['20B-20C', '20B-20C'],
    ['A/1/2', 'A/1/2'],
    ['ચેમ્બર ૩', 'ચેમ્બર ૩'],
    ['', ''],
    ['20B/F1/C4', '20B/F1/C4'],
    // Spaces typed at the ends are not part of the rack.
    [' ROW 3 ', 'ROW 3'],
  ])('new GRN: a line with rack %p can be saved and is stored as %p', async (typed, stored) => {
    useForm('create', []);
    await show('create');
    await typeLine(typed);

    // The save button of the item form is not held back by the rack.
    expect(screen.getByRole('button', { name: 'Save line' })).toBeEnabled();
    await press('Save line');

    expect(alert).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(
      addItem(expect.objectContaining({ item_table_id: ITEM_ID, qty: 10, rack: stored }) as never)
    );
  });

  it('new GRN: Next takes the line that is still in the form, whatever its rack', async () => {
    useForm('create', []);
    await show('create');
    await typeLine('20B ');

    await press('Next');
    // "Save this item first?" is asked for a typed line; the answer "Save" stores it.
    const save = alert.mock.calls[0]?.[2]?.find((button: { text: string }) => button.text === 'Save item');
    if (save) await act(async () => { await save.onPress(); });

    // Next stores the step's lines in one action.
    expect(mockDispatch).toHaveBeenCalledWith(reconcileItems([expect.objectContaining({ rack: '20B' })] as never));
  });

  it('edit: a line stored with "C3" opens with its rack, saves with it and does not hold Next back', async () => {
    useForm('edit', [storedLine('C3')]);
    await show('edit');
    expect(screen.getByText('Saved rack: C3')).toBeOnTheScreen();

    await press(`Edit ${LINE_ID}`);
    expect(screen.getByLabelText('rack')).toHaveDisplayValue('C3');
    expect(screen.getByRole('button', { name: 'Save line' })).toBeEnabled();
    await set('qty', '12');
    await press('Save line');

    expect(alert).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(
      updateItem({ grn_trl_id: LINE_ID, item: expect.objectContaining({ qty: 12, rack: 'C3' }) as never })
    );

    await press('Next');
    expect(alert).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith(`/grn-edit/${GRN_ID}/step3`);
  });

  it('edit: a rack longer than the 30 characters the server stores is refused with that reason', async () => {
    useForm('edit', [storedLine('C3')]);
    await show('edit');
    await typeLine('A'.repeat(31));

    await press('Save line');

    expect(screen.getByText('Rack must be at most 30 characters')).toBeOnTheScreen();
    expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: addItem.type }));
  });
});
