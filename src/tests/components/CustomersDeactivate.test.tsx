/** G-51: deactivating a customer says what it does. */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CustomersScreen from '../../../app/customers';
import { customerService } from '@/services/customer-service';
import { showAlert } from '@/utils/alert';

// The stale-list strip reads the network state from NetInfo (a native module, absent under Jest): the phone is online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
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
const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: true, data: rows, pagination: { total_count: 2 } } as never);
});
const mount = async () => {
  await render(<GestureHandlerRootView><CustomersScreen /></GestureHandlerRootView>);
  await screen.findByText('Hilltop Fresh Mart');
};

it('asks with the title and a message that says what deactivating does', async () => {
  await mount();
  // The screen reader's own action on the row: there is no gesture of a person for it.
  await fireEvent(rowOf('Hilltop Fresh Mart'), 'accessibilityAction', { nativeEvent: { actionName: 'toggleActive' } });
  expect(showAlert).toHaveBeenCalledTimes(1);
  const [title, message, buttons] = jest.mocked(showAlert).mock.calls[0];
  expect(title).toBe('Deactivate Hilltop Fresh Mart?');
  expect(message).toBe("They won't appear when you choose a customer for a new GRN. Their stock can still go out on orders and dispatches. Their records stay, and you can activate them again.");
  expect((buttons as { text: string }[]).map(b => b.text)).toEqual(['Cancel', 'Deactivate customer']);
  expect(customerService.inactivateCustomer).not.toHaveBeenCalled();
});

it('the visible Deactivate button of the swipe closes the row and opens the same confirmation', async () => {
  await mount();
  const button = screen.getByRole('button', { name: 'Deactivate Hilltop Fresh Mart' });
  // The swipe actions take no touch until the row is swiped open (pointerEvents none), and a swipe cannot be made here, so the
  // button's own click is called, which is what its press does.
  await act(async () => { (button.props.onClick as (event: unknown) => void)({}); });
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(showAlert).toHaveBeenCalledTimes(1);
  expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Deactivate Hilltop Fresh Mart?');
  expect(customerService.inactivateCustomer).not.toHaveBeenCalled();
});
