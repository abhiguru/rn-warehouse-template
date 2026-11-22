/**
 * WH-228: Dispatch step 2. The "Bags to dispatch" row with its error line is one view marked FIELD_BLOCK_ID (the
 * wizard bar keeps that block above itself). Same harness as DispatchItemsStepQuantity.test.tsx.
 */
import React from 'react';
import { act, render, screen, within } from '@testing-library/react-native';
import { DispatchItemsStep } from '../DispatchItemsStep';
import { blockOf, inputsIn, wordsIn, type Host } from '@/tests/helpers/fieldBlock';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/useDispatchForm', () => ({
  useDispatchForm: () => ({
    header: { disp_no: 'DD0001', customer_id: 'c1', customer_name: 'Example Traders' },
    items: [],
    isCreateMode: true,
    addFormItems: jest.fn(),
    updateFormItem: jest.fn(),
    removeFormItem: jest.fn(),
    navigateToStep: jest.fn(),
    resetFormState: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/SwipeableFormStep', () => ({ __esModule: true, default: 'SwipeableFormStep' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/features/dispatch/components', () => ({
  GRNAutocompleteBottomSheet: () => null,
  GRNItemBottomSheet: () => null,
  LotBottomSheet: () => null,
  ItemsSummaryBottomSheet: () => null,
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const bags = () => screen.getByLabelText('Bags to dispatch');
// With no lot chosen the field is `editable={false}`, which userEvent and fireEvent honour (they would type nothing), so the
// field's own change handler is called.
const type = async (text: string) => {
  await act(async () => { bags().props.onChangeText(text); });
};
beforeEach(async () => { await render(<DispatchItemsStep mode="create" />); });

it('Bags to dispatch: the block holds the quantity row and its error line, and no other field', async () => {
  await type('12.5');
  const block = blockOf(bags());
  expect(block).not.toBeNull();
  expect(inputsIn(block!)).toBe(1);
  expect(wordsIn(block!)).toContain('Quantity must be a whole number');
});

describe('WH-234 and WH-235: the whole group is the block, whatever the font scale or wrap', () => {
  // The test renderer has no layout, so whether the -10/-5/+5/+10 buttons wrap is not decided here: the block must
  // hold the box, the buttons and the error line in the same view either way, which is what lets the wrapped case work.
  const buttons = (block: Host) =>
    new Set(within(block).getAllByRole('button').map((node) => node.props.accessibilityLabel as string));

  it('the block holds the box, the four step buttons and the error line', async () => {
    await type('12.5');
    const block = blockOf(bags())!;
    expect(block).not.toBeNull();
    expect(buttons(block).size).toBe(4);
    expect(wordsIn(block)).toEqual(expect.arrayContaining(['−10', '−5', '+5', '+10', 'Quantity must be a whole number']));
  });

  it('deleting the number removes the error line from the block (the block shrinks)', async () => {
    await type('12.5');
    expect(wordsIn(blockOf(bags())!)).toContain('Quantity must be a whole number');
    await type('');
    const block = blockOf(bags())!;
    expect(wordsIn(block)).not.toContain('Quantity must be a whole number');
    expect(buttons(block).size).toBe(4);
  });
});
