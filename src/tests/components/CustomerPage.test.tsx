/** G-14: tapping a customer opens a read-only page, not an edit wizard. */
import React from 'react';

import { act, render, screen, userEvent } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { customerService } from '@/services/customer-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: (props: object) => { const { StackScreenMock } = require('@/tests/helpers/stackScreenMock'); return <StackScreenMock {...props} />; } },
  useIsFocused: () => true,
  useLocalSearchParams: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/customer-service', () => ({
  customerService: {
    getCustomerById: jest.fn(),
    updateCustomer: jest.fn(),
    createCustomer: jest.fn(),
    searchCustomers: jest.fn(),
    inactivateCustomer: jest.fn(),
    restoreCustomer: jest.fn(),
  },
}));
import CustomerPage from '../../../app/customer/[id]';

const c1 = {
  id: 'c1', name: '24 Seven Foods', mobile: '9999900302', city: 'Rajkot', gst: '', active: true, created_at: '2026-01-01',
};
const user = userEvent.setup({ delay: 0 });
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The texts that hold this wording (case as written). */
const shown = (text: string) => screen.queryAllByText(new RegExp(escape(text)));
const expectShown = (text: string) => expect(shown(text).length).toBeGreaterThan(0);
/** The text straight after the title among all the texts on the screen, in the order drawn. */
const textAfter = (title: string) => {
  const all = screen.queryAllByText(/[\s\S]*/).map(node => [node.props.children].flat(3).join(''));
  const at = all.indexOf(title);
  expect(at).toBeGreaterThanOrEqual(0);
  return all[at + 1];
};
const expectNotShown = (text: string) => expect(shown(text)).toHaveLength(0);
/** The buttons whose label is, or starts with, this wording. */
const labelled = (label: string) => screen.queryAllByRole('button', { name: new RegExp(`^${escape(label)}`) });
const press = async (label: string) => {
  await user.press(labelled(label)[0]);
};
const mount = async () => {
  await render(<CustomerPage />);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockImplementation(() => ({ id: 'c1' }) as never);
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: c1 } as never);
});

it('shows the name, the grouped mobile, the city under Address and no empty sections', async () => {
  await mount();
  expectShown('24 Seven Foods');
  expectShown('+91 99999 00302');
  expectShown('ADDRESS');
  expectShown('Rajkot');
  expectNotShown('TAX DETAILS');
  expectNotShown('CONTACT PERSON');
  expectNotShown('Contact person');
  // No typed field: the page only reads. A field has no role, so the tree is walked for one.
  const fields: unknown[] = [];
  const walk = (node: NonNullable<typeof screen.root>) => {
    if ((node.type as unknown) === 'TextInput') fields.push(node);
    for (const child of node.children) if (typeof child !== 'string') walk(child as NonNullable<typeof screen.root>);
  };
  walk(screen.root as NonNullable<typeof screen.root>);
  expect(fields).toHaveLength(0);
});

it('offers a Call action for the number', async () => {
  await mount();
  expect(labelled('Call 24 Seven Foods').length).toBeGreaterThan(0);
});

it('Edit pushes the edit form of this customer', async () => {
  await mount();
  await press('Edit');
  expect(router.push).toHaveBeenCalledWith({ pathname: '/customer-edit/[id]', params: { id: 'c1' } });
});

it('asks before deactivating, in words that say what it does, and then deactivates', async () => {
  jest.mocked(customerService.inactivateCustomer).mockResolvedValue({ success: true, message: '' } as never);
  await mount();
  await press('Deactivate customer');
  const [title, message, buttons] = jest.mocked(showAlert).mock.calls[0];
  expect(title).toBe('Deactivate 24 Seven Foods?');
  expect(message).toContain("They won't appear when you choose a customer for a new GRN. Their stock can still go out on orders and dispatches.");
  expect(customerService.inactivateCustomer).not.toHaveBeenCalled();
  await act(async () => { (buttons as { text: string; onPress?: () => void }[]).find(b => b.text === 'Deactivate customer')?.onPress?.(); });
  expect(customerService.inactivateCustomer).toHaveBeenCalledWith('c1');
  expectShown('This customer is deactivated. Activate them to change their rates.');
  expectShown('Activate customer');
});

it('activates an inactive customer without a question', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: { ...c1, active: false } } as never);
  jest.mocked(customerService.restoreCustomer).mockResolvedValue({ success: true, message: '' } as never);
  await mount();
  await press('Activate customer');
  expect(showAlert).not.toHaveBeenCalled();
  expect(customerService.restoreCustomer).toHaveBeenCalledWith('c1');
});

it('shows the sections that have a value: tax details and the contact person', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValue({
    success: true, message: '', data: { ...c1, gst: '22AAAAA0000A1Z5', contact_name: 'Test Person', contact_mobile: '9999900399' },
  } as never);
  await mount();
  expectShown('TAX DETAILS');
  expectShown('22AAAAA0000A1Z5');
  // WH-211: the contact person is a card (name, tappable mobile) in place of a CONTACT PERSON section.
  expectShown('Contact person');
  expectShown('Test Person');
  expectShown('+91 99999 00399');
});

it('shows a retry when the customer cannot be opened', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValueOnce({ success: false, message: '' } as never);
  await mount();
  expectShown("Couldn't open this customer");
  expectShown('Check your connection and try again.');
  expect(textAfter("Couldn't open this customer")).toBe('Check your connection and try again.');
  await press('Try again');
  expectShown('Rajkot');
});

it('CR-60: while loading there is no empty heading; once shown the name is the heading', async () => {
  let release: (value: unknown) => void = () => {};
  jest.mocked(customerService.getCustomerById).mockReturnValue(new Promise(resolve => { release = resolve; }) as never);
  await mount();
  const headings = () => screen.queryAllByRole('header');
  expect(headings().filter(node => [node.props.children].flat(3).join('') === '')).toHaveLength(0);
  await act(async () => { release({ success: true, message: '', data: c1 }); });
  expect(headings().map(node => [node.props.children].flat(3).join(''))).toContain('24 Seven Foods');
});

it('WH-216: a customer that cannot be opened says it in Gujarati, with the check-connection text under it', async () => {
  const { setLanguage } = require('@/i18n');
  setLanguage('gu');
  try {
    jest.mocked(customerService.getCustomerById).mockResolvedValueOnce({ success: false, message: '' } as never);
    await mount();
    expectShown('આ વેપારી ખોલી શકાયા નથી');
    expectShown('તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.');
    expect(textAfter('આ વેપારી ખોલી શકાયા નથી')).toBe('તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.');
    expect(labelled('ફરી પ્રયાસ કરો').length).toBeGreaterThan(0);
    expect(labelled('Edit')).toHaveLength(0);
  } finally {
    setLanguage('en');
  }
});

it('WH-216: Edit is in the stack header, and not while the customer is unread', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValueOnce({ success: false, message: '' } as never);
  await mount();
  expect(labelled('Edit')).toHaveLength(0);
  await screen.unmount();
  await mount();
  expect(labelled('Edit').length).toBeGreaterThan(0);
});
