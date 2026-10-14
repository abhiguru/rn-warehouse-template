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

describe('Bundle fix F36: a second tap while a confirmation is open', () => {
  it('queues one confirmation, and Cancel allows the next', async () => {
    const screen = await mount();
    await choosePerson(screen);
    await act(async () => { radio(screen, 'Staff').props.onPress(); });
    const approve = buttonInBar(screen, 'Approve as staff');
    await act(async () => { approve.props.onPress(); approve.props.onPress(); });
    expect(showAlert).toHaveBeenCalledTimes(1);
    await act(async () => { lastAlert().buttons[0].onPress?.(); });
    await act(async () => { buttonInBar(screen, 'Approve as staff').props.onPress(); });
    expect(showAlert).toHaveBeenCalledTimes(2);
  });
});
