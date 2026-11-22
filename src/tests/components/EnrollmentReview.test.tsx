/** G-23, G-24, G-53: Access requests. */
import React from 'react';

import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import EnrollmentReviewScreen from '../../../app/enrollment-review';
import { hasEnrollmentCustomers, listPendingEnrollments, reviewEnrollment } from '@/services/enrollmentReviewService';
import { customerService } from '@/services/customer-service';
import { showAlert } from '@/utils/alert';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: jest.fn(() => null) },
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/services/enrollmentReviewService', () => ({
  listPendingEnrollments: jest.fn(),
  hasEnrollmentCustomers: jest.fn(),
  reviewEnrollment: jest.fn(),
}));
jest.mock('@/services/customer-service', () => ({ customerService: { searchCustomers: jest.fn() } }));
// The sheet itself is the app's own; here it only has to open, search and report the pick: it draws a search field,
// calls the screen's own search with what is typed, and draws the rows the screen's own renderItem gives.
jest.mock('@/components/common/SearchableBottomSheet', () => ({
  SearchableBottomSheet: (props: { isVisible: boolean; searchFn: (q: string) => Promise<unknown[]>; onSelect: (item: unknown) => void; renderItem: (item: unknown, onSelect: (item: unknown) => void) => React.ReactNode; placeholder?: string }) => {
    const React = require('react');
    const { TextInput, View } = require('react-native');
    const [rows, setRows] = React.useState([] as { id: string }[]);
    if (!props.isVisible) return null;
    return (
      <View>
        <TextInput accessibilityLabel={props.placeholder} placeholder={props.placeholder} onChangeText={(q: string) => { void props.searchFn(q).then((found) => setRows(found as { id: string }[])); }} />
        {rows.map((row: { id: string }) => <React.Fragment key={row.id}>{props.renderItem(row, props.onSelect)}</React.Fragment>)}
      </View>
    );
  },
}));

const person = { id: 'p1', name: 'Test Farmer', display_name: null, mobile: '9000000011', created_at: '2026-10-14' };
const thirty = Array.from({ length: 30 }, (_, i) => ({ id: 'c' + i, name: 'Customer ' + i }));

const user = userEvent.setup({ delay: 0 });
const mount = async () => {
  await render(<EnrollmentReviewScreen />);
};
const shown = (text: string) => expect(screen.getByText(text)).toBeOnTheScreen();
const notShown = (text: string) => expect(screen.queryByText(text)).not.toBeOnTheScreen();
const choosePerson = async () => {
  // The row's label is "Name, mobile, Asked on <date>".
  await user.press(await screen.findByLabelText(/^Test Farmer, \+91 90000 00011/));
};
const addCustomer = () => user.press(screen.getByRole('button', { name: 'Add customer' }));
const approveButton = () => within(screen.getByTestId('decision-bar')).getByRole('button', { name: 'Approve as customer' });
const lastAlert = () => {
  const calls = jest.mocked(showAlert).mock.calls;
  const [title, message, buttons] = calls[calls.length - 1];
  return { title, message, buttons: (buttons ?? []) as { text: string; onPress?: () => void }[] };
};

beforeEach(() => {
  jest.clearAllMocks();
  // Choosing a person looks for the customer with their own mobile (a suggestion); none here.
  jest.mocked(customerService.searchCustomers).mockResolvedValue([]);
  jest.mocked(listPendingEnrollments).mockResolvedValue([person]);
  jest.mocked(hasEnrollmentCustomers).mockResolvedValue(true);
  jest.mocked(reviewEnrollment).mockResolvedValue(undefined);
});

describe('G-23: customers are chosen with a search, not ticked in a list', () => {
  it('draws no checkboxes for 30 customers and keeps Approve and Reject outside the scrolling list', async () => {
    await mount();
    await choosePerson();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    shown('CUSTOMERS THIS PERSON CAN SEE');
    const bar = within(screen.getByTestId('decision-bar'));
    expect(bar.getByText('Approve as customer')).toBeOnTheScreen();
    expect(bar.getByText('Reject request')).toBeOnTheScreen();
    // The scroll view has no name or role: it is the one host of that type.
    const scroll = screen.root!.queryAll(node => (node.type as unknown) === 'RCTScrollView');
    expect(scroll).toHaveLength(1);
    expect(within(scroll[0]).queryByText('Approve as customer')).not.toBeOnTheScreen();
  });

  it('picks a customer from the search sheet into a removable chip, and approves with that customer', async () => {
    jest.mocked(customerService.searchCustomers).mockResolvedValue([{ id: 'c8', name: 'Acme Foods', mobile: '9999900308', active: true }] as never);
    await mount();
    await choosePerson();
    await addCustomer();

    const search = screen.getByPlaceholderText('Search customers');
    // A single letter is too short to search: nothing is asked and nothing is listed.
    await user.type(search, 'a');
    expect(screen.queryByText('Acme Foods')).not.toBeOnTheScreen();
    expect(customerService.searchCustomers).not.toHaveBeenCalledWith('a', 20);
    await user.clear(search);
    await user.type(search, 'acme');
    expect(customerService.searchCustomers).toHaveBeenCalledWith('acme', 20);
    await user.press(await screen.findByText('Acme Foods'));

    expect(screen.getByRole('button', { name: 'Remove Acme Foods' })).toBeOnTheScreen();
    expect(screen.queryByPlaceholderText('Search customers')).not.toBeOnTheScreen();

    // The same customer picked again is ignored.
    await addCustomer();
    await user.type(screen.getByPlaceholderText('Search customers'), 'acme');
    // The chip and the search row both read Acme Foods; the row is the last.
    await waitFor(() => expect(screen.getAllByText('Acme Foods')).toHaveLength(2));
    await user.press(screen.getAllByText('Acme Foods')[1]);
    expect(screen.getAllByRole('button', { name: 'Remove Acme Foods' })).toHaveLength(1);

    await user.press(approveButton());
    expect(lastAlert().title).toBe('Approve Test Farmer?');
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(reviewEnrollment).toHaveBeenCalledWith('p1', 'approved', ['c8'], 'customer');
  });

  it('removes a chip when it is pressed', async () => {
    jest.mocked(customerService.searchCustomers).mockResolvedValue([{ id: 'c8', name: 'Acme Foods', mobile: '9999900308', active: true }] as never);
    await mount();
    await choosePerson();
    await addCustomer();
    await user.type(screen.getByPlaceholderText('Search customers'), 'acme');
    await user.press(await screen.findByText('Acme Foods'));
    await user.press(screen.getByRole('button', { name: 'Remove Acme Foods' }));
    expect(screen.queryByLabelText('Remove Acme Foods')).not.toBeOnTheScreen();
  });

  it('asks to choose a customer when none is chosen', async () => {
    await mount();
    await choosePerson();
    await user.press(approveButton());
    expect(lastAlert().title).toBe('Choose a customer');
    expect(reviewEnrollment).not.toHaveBeenCalled();
  });

  it('with no customers yet says so and offers Add customer, which opens the customer form', async () => {
    jest.mocked(hasEnrollmentCustomers).mockResolvedValue(false);
    await mount();
    await choosePerson();
    shown('No customers yet. Add the customer first, then approve.');
    await addCustomer();
    expect(router.push).toHaveBeenCalledWith('/customer-form');
  });
});

describe('G-24: one name for the job', () => {
  it('has no "Pending enrollments" heading and explains an empty list in plain words', async () => {
    jest.mocked(listPendingEnrollments).mockResolvedValue([]);
    await mount();
    shown('People who ask to use this facility appear here.');
    shown('No access requests');
    shown('Choose how each person can use this facility, then approve.');
    expect(screen.queryByText(/Pending enrollments/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/verified phone/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/Approve with assignment/)).not.toBeOnTheScreen();
  });

  it('titles the screen Access requests', async () => {
    await mount();
    const options = jest.mocked(Stack.Screen).mock.calls[0][0] as { options: { title: string } };
    expect(options.options.title).toBe('Access requests');
  });
});

describe('G-53: the back control', () => {
  it('has a centred title and a Back button instead of the bare Navigate up arrow', async () => {
    await mount();
    const { options } = jest.mocked(Stack.Screen).mock.calls[0][0] as { options: { headerTitleAlign: string; headerLeft: () => React.ReactElement } };
    expect(options.headerTitleAlign).toBe('center');
    await screen.unmount();
    await render(<>{options.headerLeft()}</>);
    expect(screen.getByText('Back')).toBeOnTheScreen();
  });
});
