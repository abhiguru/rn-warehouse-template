/**
 * G-09: the "Change warehouse server" route has a header with Back and the title when it
 * is opened from Settings (signed in), shows the server in use and leaves the language to
 * Settings; signed out it keeps the component's own title and language switch.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import OperatorServerScreen from '../../../app/operator-server';
import { setLanguage } from '@/i18n';

let mockState: Record<string, unknown>;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) } }));
const mockServer = {
  origin: 'https://warehouse-dev.gurucold.in',
  displayName: 'Dev',
  companyName: 'Dev Cold Storage (fictional data)',
  instanceId: 'i1',
};
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));
const mockSelection = jest.fn((_props: Record<string, unknown>) => null);
jest.mock('@/components/OperatorServerSelection', () => ({
  OperatorServerSelection: (props: Record<string, unknown>) => mockSelection(props),
}));

let tree: ReactTestRenderer | undefined;
async function render() {
  await act(async () => {
    tree = create(<OperatorServerScreen />);
  });
}
const texts = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join(''));
const lastProps = () => mockSelection.mock.calls[mockSelection.mock.calls.length - 1][0];

beforeEach(() => {
  jest.clearAllMocks();
  setLanguage('en');
  jest.mocked(router.canGoBack).mockReturnValue(true);
  mockState = {
    theme: { preference: 'light', brand: 'orange', language: 'en' },
    auth: { userProfile: { id: 'p1', name: 'Dev Administrator', role: 'admin', mobile: '9000000001' } },
  };
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

it('signed in: header title, Back, the server in use and no language switch', async () => {
  await render();
  expect(texts()).toContain('Change warehouse server');
  expect(texts()).toContain('Back');
  expect(lastProps()).toMatchObject({ current: mockServer, hideLanguage: true, underHeader: true });
  // One Back only: the component gets no cancel handler.
  expect(lastProps().onCancel).toBeUndefined();
});

it('signed out: a header with Back but no title, and the component keeps its own title and language switch', async () => {
  mockState = { ...mockState, auth: { userProfile: null } };
  await render();
  expect(texts()).not.toContain('Change warehouse server');
  expect(lastProps()).toMatchObject({ current: null, hideLanguage: false });
  // CR-29: no empty heading for a screen reader to stop on.
  const headings = tree!.root.findAll(node => node.props.accessibilityRole === 'header');
  expect(headings).toHaveLength(0);
});

it('with nothing to go back to: the plain component, no header', async () => {
  jest.mocked(router.canGoBack).mockReturnValue(false);
  await render();
  expect(texts()).not.toContain('Back');
  expect(lastProps().current).toBeUndefined();
});
