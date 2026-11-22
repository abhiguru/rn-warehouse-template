/** G-03: a new worker can be approved straight away as Staff or Supervisor. */
import React from 'react';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
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

describe('Approve as', () => {
  it('offers Customer (selected first), Staff and Supervisor, and not Admin', async () => {
    await mount();
    await choosePerson();
    expect(screen.getAllByText(/Approve as/).length).toBeGreaterThan(0);
    for (const label of ['Customer', 'Staff', 'Supervisor']) expect(radio(label)).toBeOnTheScreen();
    expect(screen.queryByText(/Admin/)).not.toBeOnTheScreen();
    expect(radio('Customer')).toBeChecked();
    expect(radio('Staff')).not.toBeChecked();
    expect(radio('Staff').props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    expect(buttonInBar('Approve as customer')).toBeOnTheScreen();
  });

  it('Staff hides the customer section and the button reads Approve as staff', async () => {
    await mount();
    await choosePerson();
    shown('CUSTOMERS THIS PERSON CAN SEE');
    await user.press(radio('Staff'));
    notShown('CUSTOMERS THIS PERSON CAN SEE');
    expect(buttonInBar('Approve as staff')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Add customer')).not.toBeOnTheScreen();
  });

  it('confirming approves as staff with no customers', async () => {
    await mount();
    await choosePerson();
    await user.press(radio('Staff'));
    await user.press(buttonInBar('Approve as staff'));
    expect(lastAlert().title).toBe('Approve Test Farmer as staff?');
    expect(lastAlert().message).toBe("They can sign in and work with every customer's orders, GRNs, dispatches and invoices.");
    expect(lastAlert().buttons.map(b => b.text)).toEqual(['Cancel', 'Approve as staff']);
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(reviewEnrollment).toHaveBeenCalledWith('p1', 'approved', [], 'staff');
  });

  it('confirming approves as supervisor', async () => {
    await mount();
    await choosePerson();
    await user.press(radio('Supervisor'));
    await user.press(buttonInBar('Approve as supervisor'));
    expect(lastAlert().title).toBe('Approve Test Farmer as supervisor?');
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(reviewEnrollment).toHaveBeenCalledWith('p1', 'approved', [], 'supervisor');
  });

  it('Customer with nothing chosen still asks to choose a customer', async () => {
    await mount();
    await choosePerson();
    await user.press(radio('Staff'));
    await user.press(radio('Customer'));
    await user.press(buttonInBar('Approve as customer'));
    expect(lastAlert().title).toBe('Choose a customer');
    expect(reviewEnrollment).not.toHaveBeenCalled();
  });

  it('rejecting sends no customers and no role, and needs no customer', async () => {
    await mount();
    await choosePerson();
    await user.press(radio('Staff'));
    await user.press(buttonInBar('Reject request'));
    expect(lastAlert().title).toBe('Reject Test Farmer?');
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(reviewEnrollment).toHaveBeenCalledWith('p1', 'rejected', [], 'customer');
  });

  it('starts again at Customer for the next person', async () => {
    jest.mocked(listPendingEnrollments).mockResolvedValue([person, { ...person, id: 'p2', name: 'Other Farmer', mobile: '9000000012' }]);
    await mount();
    await choosePerson();
    await user.press(radio('Staff'));
    await user.press(screen.getByLabelText(/^Other Farmer, \+91 90000 00012/));
    expect(radio('Customer')).toBeChecked();
  });
});

// The service itself, with the real module and a stand-in client (the screen tests above replace it).
describe('reviewEnrollment sends the role', () => {
  const rpc = jest.fn();
  let actual: typeof import('@/services/enrollmentReviewService');
  beforeAll(() => {
    jest.resetModules();
    jest.doMock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: async () => ({ rpc }) }));
    jest.doMock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1 }));
    actual = jest.requireActual('@/services/enrollmentReviewService');
  });
  beforeEach(() => rpc.mockReset().mockResolvedValue({ data: { success: true, data: { status: 'approved', role: 'staff' } }, error: null }));

  it('passes p_role and no customers for staff', async () => {
    await actual.reviewEnrollment('p1', 'approved', ['c1'], 'staff');
    expect(rpc).toHaveBeenCalledWith('operator_review_enrollment', { p_user_id: 'p1', p_decision: 'approved', p_customer_ids: [], p_role: 'staff' });
  });

  it('passes the chosen customers for a customer, and still insists on one', async () => {
    await actual.reviewEnrollment('p1', 'approved', ['c1']);
    expect(rpc).toHaveBeenCalledWith('operator_review_enrollment', { p_user_id: 'p1', p_decision: 'approved', p_customer_ids: ['c1'] });
    await expect(actual.reviewEnrollment('p1', 'approved', [])).rejects.toThrow();
  });

  it('approves staff with an empty customer list', async () => {
    await expect(actual.reviewEnrollment('p1', 'approved', [], 'supervisor')).resolves.toBeUndefined();
  });
});
