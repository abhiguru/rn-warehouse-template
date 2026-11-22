/** Code-review fixes CR-25, CR-57, CR-58 for the access requests screen. */
import React from 'react';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
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

describe('CR-25: a decision that was saved is never reported as not saved', () => {
  it('a failed reload after approving shows the load error, no Couldn\'t save alert, and drops the person', async () => {
    await mount();
    await choosePerson();
    await user.press(radio('Staff'));
    await user.press(buttonInBar('Approve as staff'));
    jest.mocked(listPendingEnrollments).mockRejectedValue(new Error('Unexpected list answer'));
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(reviewEnrollment).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledTimes(1); // only the confirmation question
    expect(await screen.findByText(/^Couldn't load access requests\./)).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Test Farmer, \+91 90000 00011/)).not.toBeOnTheScreen();
  });

  it('a reload that times out after approving says Check your connection (a read), no Couldn\'t save alert', async () => {
    await mount();
    await choosePerson();
    await user.press(radio('Staff'));
    await user.press(buttonInBar('Approve as staff'));
    jest.mocked(listPendingEnrollments).mockRejectedValue(new Error('Request timed out'));
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Check your connection and try again.')).toBeOnTheScreen();
    expect(screen.queryByText(/Couldn't load access requests\./)).not.toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Test Farmer, \+91 90000 00011/)).not.toBeOnTheScreen();
  });

  it('a refusal by the server shows its reason instead of Check your connection', async () => {
    jest.mocked(reviewEnrollment).mockRejectedValue(new AppError('REFUSED', 'This person is already approved.'));
    await mount();
    await choosePerson();
    await user.press(radio('Staff'));
    await user.press(buttonInBar('Approve as staff'));
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(lastAlert().title).toBe("Couldn't save the decision");
    expect(lastAlert().message).toBe('This person is already approved.');
  });

  it('a connection lost after the request went out says the decision may have been saved', async () => {
    jest.mocked(reviewEnrollment).mockRejectedValue(new Error('Network request failed'));
    await mount();
    await choosePerson();
    await user.press(radio('Staff'));
    await user.press(buttonInBar('Approve as staff'));
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(lastAlert().message).toBe('No answer from the server. It may have been saved. Go back to the list and check before trying again.');
  });

  it('a request that was never sent (no session that could be renewed) still says Check your connection', async () => {
    jest.mocked(reviewEnrollment).mockRejectedValue(new AppError('NETWORK', 'Network request failed: session refresh unavailable'));
    await mount();
    await choosePerson();
    await user.press(radio('Staff'));
    await user.press(buttonInBar('Approve as staff'));
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(lastAlert().message).toBe('Check your connection and try again.');
  });
});

describe('CR-57: Refresh keeps the selected person and the role', () => {
  it('keeps Staff selected when the person is still pending after a refresh', async () => {
    await mount();
    await choosePerson();
    await user.press(radio('Staff'));
    await user.press(screen.getByRole('button', { name: 'Refresh list' }));
    expect(radio('Staff')).toBeChecked();
  });

  it('clears the selection when the person is no longer pending', async () => {
    await mount();
    await choosePerson();
    jest.mocked(listPendingEnrollments).mockResolvedValue([]);
    await user.press(screen.getByRole('button', { name: 'Refresh list' }));
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});

describe('CR-58: wording', () => {
  it('the subtitle does not promise customers and a supervisor gets their own message', async () => {
    await mount();
    shown('Choose how each person can use this facility, then approve.');
    await choosePerson();
    await user.press(radio('Supervisor'));
    await user.press(buttonInBar('Approve as supervisor'));
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
