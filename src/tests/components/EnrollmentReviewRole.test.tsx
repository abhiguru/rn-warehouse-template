/** G-03: a new worker can be approved straight away as Staff or Supervisor. */
import React from 'react';
import { ScrollView, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
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
const thirty = Array.from({ length: 30 }, (_, i) => ({ id: 'c' + i, name: 'Customer ' + i }));

let tree: ReactTestRenderer | undefined;
const mount = async () => {
  await act(async () => { tree = create(<EnrollmentReviewScreen />); });
  return tree as ReactTestRenderer;
};
const shownText = (screen: ReactTestRenderer) =>
  screen.root.findAllByType(Text).map(node => [node.props.children].flat(3).join('')).join(' | ');
const byLabel = (screen: ReactTestRenderer, label: string) =>
  screen.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label)[0];
const choosePerson = async (screen: ReactTestRenderer) => {
  // The row's label is "Name, mobile, Asked on <date>".
  const row = screen.root.findAll(node => typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel).startsWith('Test Farmer, +91 90000 00011'))[0];
  await act(async () => { row.props.onPress(); });
};
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
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});
const buttonInBar = (screen: ReactTestRenderer, label: string) =>
  screen.root.findByProps({ testID: 'decision-bar' }).findAll(node => typeof node.props.onPress === 'function' && node.findAllByType(Text).some(t => t.props.children === label))[0];
const radio = (screen: ReactTestRenderer, label: string) =>
  screen.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === label)[0];

describe('Approve as', () => {
  it('offers Customer (selected first), Staff and Supervisor, and not Admin', async () => {
    const screen = await mount();
    await choosePerson(screen);
    const text = shownText(screen);
    expect(text).toContain('Approve as');
    for (const label of ['Customer', 'Staff', 'Supervisor']) expect(text).toContain(label);
    expect(text).not.toContain('Admin');
    expect(radio(screen, 'Customer').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(radio(screen, 'Staff').props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    expect(buttonInBar(screen, 'Approve as customer')).toBeDefined();
  });

  it('Staff hides the customer section and the button reads Approve as staff', async () => {
    const screen = await mount();
    await choosePerson(screen);
    expect(shownText(screen)).toContain('CUSTOMERS THIS PERSON CAN SEE');
    await act(async () => { radio(screen, 'Staff').props.onPress(); });
    expect(shownText(screen)).not.toContain('CUSTOMERS THIS PERSON CAN SEE');
    expect(buttonInBar(screen, 'Approve as staff')).toBeDefined();
    expect(screen.root.findAll(node => node.props.accessibilityLabel === 'Add customer')).toHaveLength(0);
  });

  it('confirming approves as staff with no customers', async () => {
    const screen = await mount();
    await choosePerson(screen);
    await act(async () => { radio(screen, 'Staff').props.onPress(); });
    await act(async () => { buttonInBar(screen, 'Approve as staff').props.onPress(); });
    expect(lastAlert().title).toBe('Approve Test Farmer as staff?');
    expect(lastAlert().message).toBe("They can sign in and work with every customer's orders, GRNs, dispatches and invoices.");
    expect(lastAlert().buttons.map(b => b.text)).toEqual(['Cancel', 'Approve as staff']);
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(reviewEnrollment).toHaveBeenCalledWith('p1', 'approved', [], 'staff');
  });

  it('confirming approves as supervisor', async () => {
    const screen = await mount();
    await choosePerson(screen);
    await act(async () => { radio(screen, 'Supervisor').props.onPress(); });
    await act(async () => { buttonInBar(screen, 'Approve as supervisor').props.onPress(); });
    expect(lastAlert().title).toBe('Approve Test Farmer as supervisor?');
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(reviewEnrollment).toHaveBeenCalledWith('p1', 'approved', [], 'supervisor');
  });

  it('Customer with nothing chosen still asks to choose a customer', async () => {
    const screen = await mount();
    await choosePerson(screen);
    await act(async () => { radio(screen, 'Staff').props.onPress(); });
    await act(async () => { radio(screen, 'Customer').props.onPress(); });
    await act(async () => { buttonInBar(screen, 'Approve as customer').props.onPress(); });
    expect(lastAlert().title).toBe('Choose a customer');
    expect(reviewEnrollment).not.toHaveBeenCalled();
  });

  it('rejecting sends no customers and no role, and needs no customer', async () => {
    const screen = await mount();
    await choosePerson(screen);
    await act(async () => { radio(screen, 'Staff').props.onPress(); });
    await act(async () => { buttonInBar(screen, 'Reject request').props.onPress(); });
    expect(lastAlert().title).toBe('Reject Test Farmer?');
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(reviewEnrollment).toHaveBeenCalledWith('p1', 'rejected', [], 'customer');
  });

  it('starts again at Customer for the next person', async () => {
    jest.mocked(listPendingEnrollments).mockResolvedValue([person, { ...person, id: 'p2', name: 'Other Farmer', mobile: '9000000012' }]);
    const screen = await mount();
    await choosePerson(screen);
    await act(async () => { radio(screen, 'Staff').props.onPress(); });
    await act(async () => { screen.root.findAll(node => typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel).startsWith('Other Farmer, +91 90000 00012'))[0].props.onPress(); });
    expect(radio(screen, 'Customer').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
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
