/**
 * The "bags to dispatch" field of the dispatch items step.
 *
 * RF-13: what counts as a whole number is tested with the parser
 * (dispatchQuantityInput.test.ts). This is the field itself: wiring it back
 * to parseInt, which turns "12.5" into 12 without a word, left every test green.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DispatchItemsStep } from '../DispatchItemsStep';

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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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

const bags = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'Bags to dispatch')!;
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));
const type = async (tree: ReactTestRenderer, text: string) => {
  await act(async () => { bags(tree).props.onChangeText(text); });
};

let tree: ReactTestRenderer;
beforeEach(async () => {
  await act(async () => { tree = create(<DispatchItemsStep mode="create" />); });
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
});

it('keeps "12.5" in the field as typed and says a whole number is needed; it does not become 12', async () => {
  await type(tree, '12.5');

  expect(bags(tree).props.value).toBe('12.5');
  expect(texts(tree)).toContain('Quantity must be a whole number');
});

it('takes a whole number, and the message goes when the text is corrected', async () => {
  await type(tree, '12.5');
  await type(tree, '12');

  expect(bags(tree).props.value).toBe('12');
  expect(texts(tree)).not.toContain('Quantity must be a whole number');
});
