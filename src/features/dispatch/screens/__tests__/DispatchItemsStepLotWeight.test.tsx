/**
 * "Lot details" on the dispatch items step (phone review 2026-10-14, UX-06).
 *
 * The weight a lot stores is the weight of one bag. The card printed it as
 * "Weight 50 kg", which reads like the weight of the lot, and "Weight 0 kg"
 * for a lot without one. It now reads "Weight 50 kg each", and the row is
 * left out when the lot has no weight.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import { setLanguage } from '@/i18n';
import { DispatchItemsStep } from '../DispatchItemsStep';

const CUSTOMER = '22222222-3333-4444-8555-666666666666';
const GRN = '11111111-2222-4333-8444-555555555555';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/useDispatchForm', () => {
  const form = {
    header: { disp_no: 'DD0001', customer_id: '22222222-3333-4444-8555-666666666666', customer_name: 'Example Traders' },
    items: [],
    isCreateMode: true,
    addFormItems: jest.fn(),
    updateFormItem: jest.fn(),
    removeFormItem: jest.fn(),
    navigateToStep: jest.fn(),
    resetFormState: jest.fn(),
  };
  return { useDispatchForm: () => form };
});
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
  GRNAutocompleteBottomSheet: 'GRNAutocompleteBottomSheet',
  GRNItemBottomSheet: () => null,
  LotBottomSheet: () => null,
  ItemsSummaryBottomSheet: () => null,
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));

let tree: ReactTestRenderer;
/** Mounts the step and chooses a GRN whose one lot has this weight; the step puts that lot in the form. */
const chooseLot = async (weight: number | null) => {
  jest.mocked(getGRNDetailByNumber).mockResolvedValue({
    success: true,
    data: {
      grn: { id: GRN, gr_no: 'G0311', date: '2026-10-01', customer_id: CUSTOMER, customer_name: 'Example Traders' },
      items: [{ id: 'lot-1', item_id: 'potato', item_name: 'Example Potatoes', quantity: 100, stock: 40, package_mark: 'M1', rack: 'R1', weight }],
    },
  } as unknown as Awaited<ReturnType<typeof getGRNDetailByNumber>>);
  await act(async () => { tree = create(<DispatchItemsStep mode="create" />); });
  const grnPicker = tree.root.find((node) => (node.type as unknown) === 'GRNAutocompleteBottomSheet');
  await act(async () => { await grnPicker.props.onSelect({ id: GRN, gr_no: 'G0311' }); });
};

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  setLanguage('en');
  jest.restoreAllMocks();
});

it('reads "Weight" and "50 kg each"', async () => {
  await chooseLot(50);

  expect(texts(tree)).toEqual(expect.arrayContaining(['Lot details', 'In stock', '40 bags', 'Weight', '50 kg each']));
  expect(texts(tree)).not.toContain('50 kg');
});

it('reads વજન and દરેક ૫૦ કિલો in Gujarati', async () => {
  setLanguage('gu');
  await chooseLot(50);

  expect(texts(tree)).toEqual(expect.arrayContaining(['વજન', 'દરેક ૫૦ કિલો']));
});

it.each([[0], [null]])('leaves the weight row out for a lot without a weight (%s)', async (weight) => {
  await chooseLot(weight);

  expect(texts(tree)).toEqual(expect.arrayContaining(['Lot details', 'In stock', '40 bags', 'M1', 'R1']));
  expect(texts(tree).some((text) => /kg|weight/i.test(text))).toBe(false);
});
