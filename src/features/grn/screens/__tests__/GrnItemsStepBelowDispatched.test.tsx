/**
 * WH-303 (Design 6.x DQ7): on the items step of an Edit GRN, a saved line's quantity below what has left the lot is refused
 * on the form with the "less than the N already dispatched" error, and stores nothing. Same harness as GrnItemsStepRack.test.tsx:
 * the step is real, its child components are stand-ins that call the real props.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { GrnItemsStep } from '@/features/grn/screens/GrnItemsStep';
import { updateItem } from '@/store/slices/grnFormSlice';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const LINE_ID = '55555555-2222-4333-8444-555555555555';
const ITEM_ID = '66666666-2222-4333-8444-555555555555';

const mockDispatch = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: [] } }),
}));

const storedLine = (rack: string, locks?: Record<string, unknown>) => ({
  locks,
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

jest.mock('@/features/grn/components/HorizontalItemForm', () => ({
  HorizontalItemForm: require('react').forwardRef((props: {
    currentItem: Record<string, unknown> & { errors?: { qty?: string } };
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
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Save line', disabled: !props.isValid, onPress: props.onSaveItem }),
      props.currentItem.errors?.qty ? createElement(Text, null, props.currentItem.errors.qty) : null
    );
  }),
}));
jest.mock('@/features/grn/components/ItemsSummaryBottomSheet', () => ({
  __esModule: true,
  default: (props: { items: { grn_trl_id: string }[]; onEditItem: (item: unknown) => void }) => {
    const { Pressable, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      null,
      props.items.map((item) => createElement(Pressable, { key: item.grn_trl_id, accessibilityRole: 'button', accessibilityLabel: `Edit ${item.grn_trl_id}`, onPress: () => props.onEditItem(item) }))
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

function useForm(items: ReturnType<typeof storedLine>[]) {
  Object.assign(mockForm, {
    header: { gr_no: 'A0010' },
    items,
    grnId: GRN_ID,
    tempGrnId: null,
    isCreateMode: false,
    resetFormState: jest.fn(),
  });
}

const user = userEvent.setup({ delay: 0 });
const show = () => render(<GrnItemsStep mode="edit" />);
const press = (name: string) => user.press(screen.getByRole('button', { name }));
const setQty = async (value: string) => {
  const input = screen.getByLabelText('qty');
  await user.clear(input);
  await user.paste(input, value);
};
const dispatchedLocks = { dispatched: true, dispatchedQty: 8, hasHistory: true, invoiced: false, onOrder: false };

describe('GRN items step: a quantity below what has left the lot', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(require('react-native').Vibration, 'vibrate').mockImplementation(() => {});
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((run: FrameRequestCallback) => { run(0); return 0; });
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('refuses 6 on a lot with 8 dispatched: the error is under Quantity and the line is not stored', async () => {
    useForm([storedLine('C3', dispatchedLocks)]);
    await show();
    await press(`Edit ${LINE_ID}`);
    await setQty('6');
    await press('Save line');

    expect(screen.getByText('6 Bag is less than the 8 Bag already dispatched from this lot.')).toBeOnTheScreen();
    expect(alert).toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: updateItem.type }));
  });

  it('stores the line when the quantity equals what has left', async () => {
    useForm([storedLine('C3', dispatchedLocks)]);
    await show();
    await press(`Edit ${LINE_ID}`);
    await setQty('8');
    await press('Save line');

    expect(alert).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(updateItem({ grn_trl_id: LINE_ID, item: expect.objectContaining({ qty: 8 }) as never }));
  });

  it('never fires on a line with no dispatches (the online form is as it was)', async () => {
    useForm([storedLine('C3')]);
    await show();
    await press(`Edit ${LINE_ID}`);
    await setQty('1');
    await press('Save line');

    expect(alert).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(updateItem({ grn_trl_id: LINE_ID, item: expect.objectContaining({ qty: 1 }) as never }));
  });
});
