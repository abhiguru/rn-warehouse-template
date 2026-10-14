/** G-23, G-24, G-53: Access requests. */
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

describe('G-23: customers are chosen with a search, not ticked in a list', () => {
  it('draws no checkboxes for 30 customers and keeps Approve and Reject outside the scrolling list', async () => {
    const screen = await mount();
    await choosePerson(screen);
    expect(screen.root.findAll(node => node.props.accessibilityRole === 'checkbox')).toHaveLength(0);
    expect(shownText(screen)).toContain('CUSTOMERS THIS PERSON CAN SEE');
    const bar = screen.root.findByProps({ testID: 'decision-bar' });
    expect(bar.findAllByType(Text).map(node => node.props.children)).toEqual(expect.arrayContaining(['Approve as customer', 'Reject request']));
    const scroll = screen.root.findByType(ScrollView);
    expect(scroll.findAllByType(Text).map(node => node.props.children)).not.toContain('Approve as customer');
  });

  it('picks a customer from the search sheet into a removable chip, and approves with that customer', async () => {
    jest.mocked(customerService.searchCustomers).mockResolvedValue([{ id: 'c8', name: 'Acme Foods', mobile: '9999900308', active: true }] as never);
    const screen = await mount();
    await choosePerson(screen);
    const add = screen.root.findAll(node => typeof node.props.onPress === 'function' && node.findAllByType(Text).some(t => t.props.children === 'Add customer'))[0];
    await act(async () => { add.props.onPress(); });

    const sheet = screen.root.findByType('SheetOpen' as never);
    expect(sheet.props.placeholder).toBe('Search customers');
    const hits = await sheet.props.searchFn('acme');
    expect(customerService.searchCustomers).toHaveBeenCalledWith('acme', 20);
    expect(hits).toEqual([expect.objectContaining({ id: 'c8', name: 'Acme Foods' })]);
    expect(await sheet.props.searchFn('a')).toEqual([]);
    await act(async () => { sheet.props.onSelect(hits[0]); });

    expect(byLabel(screen, 'Remove Acme Foods')).toBeDefined();
    expect(screen.root.findAllByType('SheetOpen' as never)).toHaveLength(0);

    // The same customer picked again is ignored.
    await act(async () => { add.props.onPress(); });
    await act(async () => { screen.root.findByType('SheetOpen' as never).props.onSelect(hits[0]); });
    expect(screen.root.findAll(node => node.props.accessibilityLabel === 'Remove Acme Foods' && typeof node.props.onPress === 'function')).toHaveLength(1);

    const approve = screen.root.findByProps({ testID: 'decision-bar' }).findAll(node => typeof node.props.onPress === 'function' && node.findAllByType(Text).some(t => t.props.children === 'Approve as customer'))[0];
    await act(async () => { approve.props.onPress(); });
    expect(lastAlert().title).toBe('Approve Test Farmer?');
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    expect(reviewEnrollment).toHaveBeenCalledWith('p1', 'approved', ['c8'], 'customer');
  });

  it('removes a chip when it is pressed', async () => {
    const screen = await mount();
    await choosePerson(screen);
    const add = screen.root.findAll(node => typeof node.props.onPress === 'function' && node.findAllByType(Text).some(t => t.props.children === 'Add customer'))[0];
    await act(async () => { add.props.onPress(); });
    await act(async () => { screen.root.findByType('SheetOpen' as never).props.onSelect({ id: 'c8', name: 'Acme Foods' }); });
    await act(async () => { byLabel(screen, 'Remove Acme Foods').props.onPress(); });
    expect(screen.root.findAll(node => node.props.accessibilityLabel === 'Remove Acme Foods')).toHaveLength(0);
  });

  it('asks to choose a customer when none is chosen', async () => {
    const screen = await mount();
    await choosePerson(screen);
    const approve = screen.root.findAll(node => typeof node.props.onPress === 'function' && node.findAllByType(Text).some(t => t.props.children === 'Approve as customer'))[0];
    await act(async () => { approve.props.onPress(); });
    expect(lastAlert().title).toBe('Choose a customer');
    expect(reviewEnrollment).not.toHaveBeenCalled();
  });

  it('with no customers yet says so and offers Add customer, which opens the customer form', async () => {
    jest.mocked(hasEnrollmentCustomers).mockResolvedValue(false);
    const screen = await mount();
    await choosePerson(screen);
    expect(shownText(screen)).toContain('No customers yet. Add the customer first, then approve.');
    const add = screen.root.findAll(node => typeof node.props.onPress === 'function' && node.findAllByType(Text).some(t => t.props.children === 'Add customer'))[0];
    await act(async () => { add.props.onPress(); });
    expect(router.push).toHaveBeenCalledWith('/customer-form');
  });
});

describe('G-24: one name for the job', () => {
  it('has no "Pending enrollments" heading and explains an empty list in plain words', async () => {
    jest.mocked(listPendingEnrollments).mockResolvedValue([]);
    const screen = await mount();
    const text = shownText(screen);
    expect(text).toContain('People who ask to use this facility appear here.');
    expect(text).toContain('No access requests');
    expect(text).toContain('Choose how each person can use this facility, then approve.');
    expect(text).not.toContain('Pending enrollments');
    expect(text).not.toContain('verified phone');
    expect(text).not.toContain('Approve with assignment');
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
    let header!: ReactTestRenderer;
    await act(async () => { header = create(<>{options.headerLeft()}</>); });
    const texts = header.root.findAllByType(Text).map(node => node.props.children);
    expect(texts).toContain('Back');
    await act(async () => { header.unmount(); });
  });
});
