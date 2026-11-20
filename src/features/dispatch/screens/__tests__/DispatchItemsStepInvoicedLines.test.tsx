/**
 * The dispatch items step, editing a dispatch whose line is on a live invoice (App 93): that line is read only, so
 * opening it says why and changes nothing, while the other lines open as usual.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { showAlert } from '@/utils/alert';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import type { DispatchItemData } from '@/types/dispatch.types';
import { DispatchItemsStep } from '../DispatchItemsStep';

const CUSTOMER = '22222222-3333-4444-8555-666666666666';
const line = (unique_id: string, grnItems_id: string, over: Partial<DispatchItemData> = {}): DispatchItemData => ({
  unique_id,
  grns_id: '11111111-2222-4333-8444-555555555555',
  grns_gr_no: 'G0311',
  grns_date: '2026-10-01',
  grns_customer_name: 'Example Traders',
  grns_customer_id: CUSTOMER,
  grnItems_id,
  grnItems_item_id: '33333333-4444-4555-8666-777777777777',
  grnItems_item_name: 'Example Potatoes',
  grnItems_quantity: 100,
  grnItems_stock: 95,
  grnItems_package_mark: 'M1',
  grnItems_rack: 'R1',
  grnItems_weight: 50,
  disp_quantity: 5,
  ...over,
});
const INVOICED = line('line-1', 'lot-1', { invoice_no: 'INV7' });
const PLAIN = line('line-2', 'lot-2');

const mockForm = {
  header: { disp_no: 'DD0001', customer_id: CUSTOMER, customer_name: 'Example Traders' },
  items: [] as DispatchItemData[],
  heldBags: {} as Record<string, number>,
  isCreateMode: false,
  addFormItems: jest.fn(),
  updateFormItem: jest.fn(),
  removeFormItem: jest.fn(),
  navigateToStep: jest.fn(async () => true),
  resetFormState: jest.fn(),
};

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/useDispatchForm', () => ({ useDispatchForm: () => mockForm }));
jest.mock('expo-router', () => {
  const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    router: mockRouter,
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/SwipeableFormStep', () => ({ __esModule: true, default: 'SwipeableFormStep' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: 'DispatchStepIndicator', dispatchSteps: () => [] }));
jest.mock('@/features/dispatch/components', () => ({
  GRNAutocompleteBottomSheet: 'GRNAutocompleteBottomSheet',
  GRNItemBottomSheet: 'GRNItemBottomSheet',
  LotBottomSheet: 'LotBottomSheet',
  // A stand-in with one button per saved line, each calling the step's own onEditItem with that line.
  ItemsSummaryBottomSheet: ({ items, onEditItem }: { items: DispatchItemData[]; onEditItem: (item: DispatchItemData) => void }) => {
    const { createElement } = jest.requireActual('react');
    const { Pressable, Text } = jest.requireActual('react-native');
    return items.map((item) =>
      createElement(
        Pressable,
        { key: item.unique_id, accessibilityRole: 'button', accessibilityLabel: `Edit ${item.unique_id}`, onPress: () => onEditItem(item) },
        createElement(Text, null, item.unique_id),
      ),
    );
  },
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockForm.items = [INVOICED, PLAIN];
  jest.mocked(getGRNDetailByNumber).mockResolvedValue({
    success: true,
    data: {
      grn: { id: INVOICED.grns_id, gr_no: 'G0311', date: '2026-10-01', customer_id: CUSTOMER, customer_name: 'Example Traders' },
      items: [],
    },
  } as unknown as Awaited<ReturnType<typeof getGRNDetailByNumber>>);
  await render(<DispatchItemsStep mode="edit" />);
});
afterEach(() => jest.restoreAllMocks());

it('a line on an invoice is read only: opening it says "This line can\'t be changed" and why, and loads nothing', async () => {
  await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: 'Edit line-1' }));

  expect(showAlert).toHaveBeenCalledWith("This line can't be changed", 'On invoice INV7. Delete or edit the invoice first.');
  expect(getGRNDetailByNumber).not.toHaveBeenCalled();
});

it('the other line of the same dispatch opens for editing', async () => {
  await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: 'Edit line-2' }));

  expect(showAlert).not.toHaveBeenCalled();
  expect(getGRNDetailByNumber).toHaveBeenCalledWith('G0311', true);
});
