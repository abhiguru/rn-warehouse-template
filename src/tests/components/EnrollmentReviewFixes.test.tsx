/** Code-review fixes CR-25, CR-57, CR-58 for the access requests screen. */
import React from 'react';
import { ScrollView, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppError } from '@/utils/appError';
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
  await act(async () => { byLabel(screen, 'Test Farmer, +91 90000 00011').props.onPress(); });
};
const lastAlert = () => {
  const calls = jest.mocked(showAlert).mock.calls;
  const [title, message, buttons] = calls[calls.length - 1];
  return { title, message, buttons: (buttons ?? []) as { text: string; onPress?: () => void }[] };
};

beforeEach(() => {
  jest.clearAllMocks();
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


describe('CR-25: a decision that was saved is never reported as not saved', () => {
  it('a failed reload after approving shows the load error, no Couldn\'t save alert, and drops the person', async () => {
    const screen = await mount();
    await choosePerson(screen);
    await act(async () => { radio(screen, 'Staff').props.onPress(); });
    await act(async () => { buttonInBar(screen, 'Approve as staff').props.onPress(); });
    jest.mocked(listPendingEnrollments).mockRejectedValue(new Error('timeout'));
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(reviewEnrollment).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledTimes(1); // only the confirmation question
    expect(shownText(screen)).toContain("Couldn't load access requests.");
    expect(byLabel(screen, 'Test Farmer, +91 90000 00011')).toBeUndefined();
  });

  it('a refusal by the server shows its reason instead of Check your connection', async () => {
    jest.mocked(reviewEnrollment).mockRejectedValue(new AppError('REFUSED', 'This person is already approved.'));
    const screen = await mount();
    await choosePerson(screen);
    await act(async () => { radio(screen, 'Staff').props.onPress(); });
    await act(async () => { buttonInBar(screen, 'Approve as staff').props.onPress(); });
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(lastAlert().title).toBe("Couldn't save the decision");
    expect(lastAlert().message).toBe('This person is already approved.');
  });

  it('a lost connection still says Check your connection', async () => {
    jest.mocked(reviewEnrollment).mockRejectedValue(new Error('Network request failed'));
    const screen = await mount();
    await choosePerson(screen);
    await act(async () => { radio(screen, 'Staff').props.onPress(); });
    await act(async () => { buttonInBar(screen, 'Approve as staff').props.onPress(); });
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(lastAlert().message).toBe('Check your connection and try again.');
  });
});

describe('CR-57: Refresh keeps the selected person and the role', () => {
  it('keeps Staff selected when the person is still pending after a refresh', async () => {
    const screen = await mount();
    await choosePerson(screen);
    await act(async () => { radio(screen, 'Staff').props.onPress(); });
    await act(async () => { screen.root.findAll(node => typeof node.props.onPress === 'function' && node.findAllByType(Text).some(t => t.props.children === 'Refresh list'))[0].props.onPress(); });
    expect(radio(screen, 'Staff').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
  });

  it('clears the selection when the person is no longer pending', async () => {
    const screen = await mount();
    await choosePerson(screen);
    jest.mocked(listPendingEnrollments).mockResolvedValue([]);
    await act(async () => { screen.root.findAll(node => typeof node.props.onPress === 'function' && node.findAllByType(Text).some(t => t.props.children === 'Refresh list'))[0].props.onPress(); });
    expect(screen.root.findAll(node => node.props.accessibilityRole === 'radio')).toHaveLength(0);
  });
});

describe('CR-58: wording', () => {
  it('the subtitle does not promise customers and a supervisor gets their own message', async () => {
    const screen = await mount();
    expect(shownText(screen)).toContain('Choose how each person can use this facility, then approve.');
    await choosePerson(screen);
    await act(async () => { radio(screen, 'Supervisor').props.onPress(); });
    await act(async () => { buttonInBar(screen, 'Approve as supervisor').props.onPress(); });
    expect(lastAlert().message).toContain('manage users who are not administrators');
  });
});

describe('CR-25: the service marks a server refusal', () => {
  const rpc = jest.fn();
  let actual: typeof import('@/services/enrollmentReviewService');
  beforeAll(() => {
    jest.resetModules();
    jest.doMock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: async () => ({ rpc }) }));
    jest.doMock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1 }));
    actual = jest.requireActual('@/services/enrollmentReviewService');
  });
  it('a coded RPC error is a REFUSED AppError; one without a code is a plain Error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'INVALID_ROLE' } });
    await expect(actual.reviewEnrollment('p1', 'approved', [], 'staff')).rejects.toMatchObject({ code: 'REFUSED' });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Network request failed' } });
    const failure = await actual.reviewEnrollment('p1', 'approved', [], 'staff').catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as { code?: string }).code).toBeUndefined();
  });
});
