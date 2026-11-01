/** The dispatch saved-items sheet with a line on an invoice (App 93): its row says so, and its swipe Delete is refused. */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { showAlert } from '@/utils/alert';
import type { DispatchItemData } from '@/types/dispatch.types';
import { ItemsSummaryBottomSheet } from '../ItemsSummaryBottomSheet';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// The swipe is drawn open: the row and its Delete action side by side.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const ReactMock = require('react');
  return {
    __esModule: true,
    default: (props: { children: React.ReactNode; renderRightActions?: () => React.ReactNode }) =>
      ReactMock.createElement(ReactMock.Fragment, null, props.children, props.renderRightActions?.()),
  };
});
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const line = (unique_id: string, name: string, over: Partial<DispatchItemData> = {}): DispatchItemData =>
  ({
    unique_id, grns_id: 'grn-1', grns_gr_no: 'G0311', grns_date: '2026-10-01', grns_customer_name: 'Example Traders',
    grnItems_id: `lot-${unique_id}`, grnItems_item_id: 'item', grnItems_item_name: name, grnItems_quantity: 100, grnItems_stock: 40,
    grnItems_package_mark: 'PM', grnItems_rack: 'B-14', grnItems_weight: 50, disp_quantity: 5, ...over,
  }) as DispatchItemData;

let tree: ReactTestRenderer;
const onDeleteItem = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  act(() => {
    tree = create(
      <ItemsSummaryBottomSheet
        isVisible
        onClose={jest.fn()}
        items={[line('a', 'Invoiced Potatoes', { invoice_no: 'INV7' }), line('b', 'Free Onions')]}
        onDeleteItem={onDeleteItem}
        onEditItem={jest.fn()}
      />,
    );
  });
});
afterEach(() => {
  act(() => tree.unmount());
  jest.restoreAllMocks();
});

const texts = () => tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));
const deleteOf = (label: RegExp) =>
  tree.root.find((node) => typeof node.props.onPress === 'function' && typeof node.props.accessibilityLabel === 'string' && label.test(node.props.accessibilityLabel));

it('the row of the invoiced line says which invoice holds it', () => {
  expect(texts()).toContain('On invoice INV7. Delete or edit the invoice first.');
});

it('swipe Delete on the invoiced line is locked and only explains; nothing is deleted', () => {
  act(() => deleteOf(/Invoiced Potatoes/).props.onPress());

  expect(showAlert).toHaveBeenCalledTimes(1);
  expect(jest.mocked(showAlert).mock.calls[0][1]).toBe('On invoice INV7. Delete or edit the invoice first.');
  expect(onDeleteItem).not.toHaveBeenCalled();
});

it('the other line asks to delete and deletes only when confirmed', () => {
  act(() => deleteOf(/Free Onions/).props.onPress());
  const buttons = jest.mocked(showAlert).mock.calls[0][2] as { style?: string; onPress?: () => void }[];
  expect(onDeleteItem).not.toHaveBeenCalled();
  act(() => buttons.find((button) => button.style === 'destructive')!.onPress!());
  expect(onDeleteItem).toHaveBeenCalledWith('b');
});
