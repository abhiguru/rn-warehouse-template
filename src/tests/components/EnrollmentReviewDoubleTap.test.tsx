/** G-03: a new worker can be approved straight away as Staff or Supervisor. */
import React from 'react';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
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
// The sheet itself is the app's own; here it only has to open, search and report the pick.
jest.mock('@/components/common/SearchableBottomSheet', () => ({
  SearchableBottomSheet: (props: { isVisible: boolean; searchFn: (q: string) => Promise<unknown[]>; onSelect: (item: unknown) => void; renderItem: (item: unknown, onSelect: (item: unknown) => void) => React.ReactNode; placeholder?: string }) =>
    props.isVisible ? require('react').createElement('SheetOpen', { searchFn: props.searchFn, onSelect: props.onSelect, renderItem: props.renderItem, placeholder: props.placeholder }) : null,
}));

const person = { id: 'p1', name: 'Test Farmer', display_name: null, mobile: '9000000011', created_at: '2026-10-14' };

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
const lastAlert = () => {
  const calls = jest.mocked(showAlert).mock.calls;
  const [title, message, buttons] = calls[calls.length - 1];
  return { title, message, buttons: (buttons ?? []) as { text: string; onPress?: () => void }[] };
};
const buttonInBar = (label: string) => within(screen.getByTestId('decision-bar')).getByRole('button', { name: label });
const radio = (label: string) => screen.getByRole('radio', { name: label });

beforeEach(() => {
  jest.clearAllMocks();
  // Choosing a person looks for the customer with their own mobile (a suggestion); none here.
  jest.mocked(customerService.searchCustomers).mockResolvedValue([]);
  jest.mocked(listPendingEnrollments).mockResolvedValue([person]);
  jest.mocked(hasEnrollmentCustomers).mockResolvedValue(true);
  jest.mocked(reviewEnrollment).mockResolvedValue(undefined);
});

describe('Bundle fix F36: a second tap while a confirmation is open', () => {
  it('queues one confirmation, and Cancel allows the next', async () => {
    await mount();
    await choosePerson();
    await user.press(radio('Staff'));
    const approve = buttonInBar('Approve as staff');
    // Two taps in one go, before the screen draws again: the host's click handler is what a tap calls.
    await act(async () => { approve.props.onClick({}); approve.props.onClick({}); });
    expect(showAlert).toHaveBeenCalledTimes(1);
    await act(async () => { lastAlert().buttons[0].onPress?.(); });
    await user.press(buttonInBar('Approve as staff'));
    expect(showAlert).toHaveBeenCalledTimes(2);
  });
});

describe('Users list after a decision (review fix)', () => {
  it('tells the Users list to load again once a decision is saved', async () => {
    const { subscribeUserListChanges } = require('@/utils/userListSync');
    const seen: unknown[] = [];
    const stop = subscribeUserListChanges((change: unknown) => seen.push(change));
    await mount();
    await choosePerson();
    await user.press(buttonInBar('Reject request'));
    const confirm = lastAlert().buttons.find(b => b.onPress && b.text !== 'Cancel');
    expect(seen).toEqual([]);
    await act(async () => { confirm?.onPress?.(); });
    stop();
    expect(reviewEnrollment).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ kind: 'refresh' }]);
  });
});
