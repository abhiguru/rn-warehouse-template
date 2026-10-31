/** G-51: deactivating a customer says what it does. */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CustomersScreen from '../../../app/customers';
import { customerService } from '@/services/customer-service';
import { showAlert } from '@/utils/alert';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/services/customer-service', () => ({
  customerService: { getCustomerList: jest.fn(), getCustomerCounts: jest.fn(async () => null), inactivateCustomer: jest.fn(), restoreCustomer: jest.fn() },
}));

// The REAL ReanimatedSwipeable, wrapped only to count calls of the close() the row makes through its ref.
const mockClose = jest.fn();
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const mockReact = require('react');
  const Actual = jest.requireActual('react-native-gesture-handler/ReanimatedSwipeable').default;
  return {
    __esModule: true,
    default: mockReact.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      mockReact.createElement(Actual, {
        ...props,
        ref: (methods: { close: () => void } | null) => {
          if (methods && !(methods as { wrapped?: boolean }).wrapped) {
            const close = methods.close;
            Object.assign(methods, { wrapped: true, close: () => { mockClose(); close(); } });
          }
          if (typeof ref === 'function') ref(methods);
          else if (ref) (ref as { current: unknown }).current = methods;
        },
      })),
  };
});

const rows = [
  { id: 'c1', name: 'Hilltop Fresh Mart', mobile: '9999900320', city: 'Rajkot', active: true },
  { id: 'c2', name: 'Old Stores', mobile: '9999900321', city: 'Surat', active: false },
];
const rowOf = (screen: ReactTestRenderer, name: string) =>
  screen.root.find(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button' &&
    typeof node.props.accessibilityHint === 'string' && String(node.props.accessibilityLabel).startsWith(name));

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: true, data: rows, pagination: { total_count: 2 } } as never);
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});
const mount = async () => {
  await act(async () => { tree = create(<GestureHandlerRootView><CustomersScreen /></GestureHandlerRootView>); });
  return tree as ReactTestRenderer;
};

it('asks with the title and a message that says what deactivating does', async () => {
  const screen = await mount();
  await act(async () => {
    rowOf(screen, 'Hilltop Fresh Mart').props.onAccessibilityAction({ nativeEvent: { actionName: 'toggleActive' } });
  });
  expect(showAlert).toHaveBeenCalledTimes(1);
  const [title, message, buttons] = jest.mocked(showAlert).mock.calls[0];
  expect(title).toBe('Deactivate Hilltop Fresh Mart?');
  expect(message).toBe("They won't appear when you choose a customer for a new GRN, dispatch or order. Their records stay, and you can activate them again.");
  expect((buttons as { text: string }[]).map(b => b.text)).toEqual(['Cancel', 'Deactivate customer']);
  expect(customerService.inactivateCustomer).not.toHaveBeenCalled();
});

it('the visible Deactivate button of the swipe closes the row and opens the same confirmation', async () => {
  const screen = await mount();
  const button = screen.root.findAll(node => node.props.accessibilityLabel === 'Deactivate Hilltop Fresh Mart' && typeof node.props.onPress === 'function')[0];
  expect(button).toBeDefined();
  await act(async () => { button.props.onPress(); });
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(showAlert).toHaveBeenCalledTimes(1);
  expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Deactivate Hilltop Fresh Mart?');
  expect(customerService.inactivateCustomer).not.toHaveBeenCalled();
});
