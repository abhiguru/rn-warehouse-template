/**
 * O07: Help (app/help.tsx), opened from Settings. It shows the facility and its
 * server address, who to ask, what the four roles mean (and which one is yours),
 * what to do when the phone, number or role changes, and the support details
 * that can be shared. There is no support contact in the app's configuration, so
 * Help says so instead of inventing one.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';

let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let mockServer: Record<string, string> | null = null;
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));
const mockCentral = jest.fn(() => false);
jest.mock('@/config/envConfig', () => ({
  ...jest.requireActual('@/config/envConfig'),
  isCentralLoginConfigured: () => mockCentral(),
}));

import HelpScreen from '../../../app/help';
import { SectionHeader } from '@/components/ui/SectionHeader';

beforeEach(() => {
  setLanguage('en');
  mockCentral.mockReturnValue(false);
  mockServer = { origin: 'https://north-cold.example.test', instanceId: 'instance-north', displayName: 'North', companyName: 'North Cold Store' };
  mockState = {
    theme: { preference: 'light', brand: 'orange' },
    auth: { userProfile: { id: 'profile-1', name: 'Asha Example', role: 'staff', mobile: '9000000002' } },
  };
});
afterEach(() => setLanguage('en'));

async function shown() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<HelpScreen />);
  });
  const texts = tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));
  return { tree, texts };
}

it('shows the facility, who to ask, the roles, the changes and the support details', async () => {
  const { tree, texts } = await shown();
  expect(texts).toEqual(
    expect.arrayContaining([
      'Help',
      'YOUR FACILITY',
      'North Cold Store',
      'Server address',
      'https://north-cold.example.test',
      'GETTING HELP',
      'For help with the app or your account, ask an administrator of your facility.',
      "The app has no support contact details of its own. Your facility's office can tell you who to ask.",
      'ROLES',
      'Your role: Staff',
      'Admin',
      'Everything, including access requests, users and administrators.',
      'Supervisor',
      'Runs the warehouse: orders, GRNs, dispatches, invoices, prices, customers, items, and users who are not administrators. Cannot approve access requests.',
      'Staff',
      'Orders, GRNs, dispatches and invoices for every customer. Cannot manage customers, items, prices or users.',
      'Customer',
      'Places orders and sees stock, GRNs, dispatches, invoices and reports for the customers assigned to them.',
      'WHEN SOMETHING CHANGES',
      "New phone: install the app, enter your cold storage's server address (it starts with https://) or scan its QR code, and sign in with your mobile number. The code comes by SMS.",
      'New mobile number: you sign in with your number, and the app cannot change it. Ask an administrator of your facility what to do.',
      'Different role or access: only an administrator of your facility can change your role and the customers you see.',
    ])
  );
  // The signed-in person's mobile number is not on the page or in the shared details.
  expect(texts.join('\n')).not.toContain('9000000002');
  expect(tree.root.findAll((node) => node.props.testID === 'app-diagnostics')).not.toHaveLength(0);
  // Only the own role is marked.
  const marked = tree.root.findAll(
    (node) => typeof node.type !== 'string' && node.props.accessibilityState?.selected === true
  );
  expect(marked.map((node) => node.props.accessibilityLabel)).toEqual([
    'Staff, Orders, GRNs, dispatches and invoices for every customer. Cannot manage customers, items, prices or users.',
  ]);
});

it('tells a central-login build to use the association sign-in on a new phone', async () => {
  mockCentral.mockReturnValue(true);
  const { texts } = await shown();
  expect(texts).toContain(
    'New phone: install the app, sign in with your association sign-in, then open your facility from My facilities.'
  );
  expect(texts.join('\n')).not.toContain("enter your facility's address");
});

it('says when no facility is chosen', async () => {
  mockServer = null;
  const { texts } = await shown();
  expect(texts).toContain('No facility is chosen on this phone.');
  expect(texts).not.toContain('Server address');
});

it('names the role in Gujarati and keeps the address as typed', async () => {
  setLanguage('gu');
  mockState = { ...mockState, auth: { userProfile: { id: 'profile-1', role: 'admin' } } };
  const { texts } = await shown();
  expect(texts).toEqual(expect.arrayContaining(['મદદ', 'તમારો હોદ્દો: એડમિન', 'https://north-cold.example.test']));
});

// G-46: an administrator has no administrator to ask.
it('tells an administrator to share the details with whoever set up the server', async () => {
  mockState = { ...mockState, auth: { userProfile: { id: 'profile-1', name: 'Asha Example', role: 'admin', mobile: '9000000002' } } };
  const { texts } = await shown();
  expect(texts).toContain(
    "You are this facility's administrator. For problems with the app, share the details below with whoever set up your server."
  );
  expect(texts).not.toContain('For help with the app or your account, ask an administrator of your facility.');
  expect(texts).not.toContain("The app has no support contact details of its own. Your facility's office can tell you who to ask.");
});

it('keeps "ask an administrator" for a staff member', async () => {
  const { texts } = await shown();
  expect(texts).toContain('For help with the app or your account, ask an administrator of your facility.');
  expect(texts).not.toContain(
    "You are this facility's administrator. For problems with the app, share the details below with whoever set up your server."
  );
});

// G-43: every title is a SectionHeader.
it('draws its section titles with the shared SectionHeader', async () => {
  const { tree } = await shown();
  const headers = tree.root.findAllByType(SectionHeader).map(node => node.props.title);
  expect(headers).toEqual(['Your facility', 'Getting help', 'Roles', 'When something changes', 'Details for support']);
});
