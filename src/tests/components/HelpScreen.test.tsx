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
      'Your facility',
      'North Cold Store',
      'Server address',
      'https://north-cold.example.test',
      'Getting help',
      'For help with the app or your account, ask an administrator of your facility.',
      "The app has no support contact details of its own. Your facility's office can tell you who to ask.",
      'Roles',
      'Your role: Staff',
      'Admin',
      'Full system access and user management',
      'Supervisor',
      'Can manage operations and view all data',
      'Staff',
      'Can create and manage GRNs and dispatches',
      'Customer',
      'Can view assigned orders and invoices',
      'When something changes',
      "New phone: install the app, enter your facility's address and sign in with your mobile number. The code comes by SMS.",
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
    'Staff, Can create and manage GRNs and dispatches',
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
