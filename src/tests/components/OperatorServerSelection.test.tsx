import React from 'react';
import { act, create } from 'react-test-renderer';
import { router } from 'expo-router';
import { OperatorServerSelection } from '@/components/OperatorServerSelection';
import { logout } from '@/store/slices/authSlice';
import { showAlert } from '@/utils/alert';
import { beginOperatorSwitch } from '@/config/supabaseConfig';
import { commitStagedOperatorServer, discoverOperator, getActiveOperatorServer, stageOperatorServer } from '@/config/operatorServer';

jest.mock('react-native', () => {
  const React = require('react');
  const element = (name: string) => ({ children, ...props }: Record<string, unknown>) =>
    React.createElement(name, props, children);
  return {
    View: element('View'), Text: element('Text'), TextInput: element('TextInput'),
    Modal: element('Modal'), ActivityIndicator: element('ActivityIndicator'),
    ScrollView: element('ScrollView'), KeyboardAvoidingView: element('KeyboardAvoidingView'),
    Keyboard: { dismiss: jest.fn() },
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.default },
    Alert: { alert: jest.fn() }, StyleSheet: { create: (styles: unknown) => styles },
  };
});
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: true }, jest.fn()] }));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return { SafeAreaView: ({ children, ...props }: Record<string, unknown>) => React.createElement('SafeAreaView', props, children) };
});
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/hooks/useTheme', () => {
  const tokens = jest.requireActual('@/theme/tokens').getTokens('orange', 'light');
  return { useTokens: () => tokens, useThemedStyles: (factory: (t: unknown) => unknown) => factory(tokens) };
});
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn() } }));
jest.mock('@/components/ui/Button', () => {
  const React = require('react');
  return { Button: ({ children, ...props }: Record<string, unknown>) => React.createElement('Button', props, children) };
});
jest.mock('@/store/hooks', () => ({ useAppDispatch: () => jest.fn() }));
// The language switch has its own controls and store access; it is not under test here.
jest.mock('@/components/LanguageSwitch', () => ({
  LanguageSwitch: () => require('react').createElement('LanguageSwitch'),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({ language: 'en', preference: 'system', setPreference: jest.fn() }),
}));
jest.mock('@/store/slices/authSlice', () => ({ logout: jest.fn() }));
jest.mock('@/store/slices/grnFormSlice', () => ({ resetForm: jest.fn() }));
jest.mock('@/store/slices/dispatchFormSlice', () => ({ resetForm: jest.fn() }));
jest.mock('@/store/slices/invoiceFormSlice', () => ({ resetForm: jest.fn() }));
jest.mock('@/services/configService', () => ({ __esModule: true, default: { clearCache: jest.fn() } }));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn() }));
jest.mock('@/lib/queryClient', () => ({ queryClient: { isMutating: () => 0 } }));
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorSwitch: jest.fn(), endOperatorSwitch: jest.fn(),
  clearPendingEnrollment: jest.fn(), getPendingEnrollmentToken: jest.fn(), signOutPendingEnrollment: jest.fn(),
}));
jest.mock('@/config/operatorServer', () => ({
  discoverOperator: jest.fn(), commitStagedOperatorServer: jest.fn(),
  getActiveOperatorServer: jest.fn(), parseOperatorOrigin: jest.fn(), stageOperatorServer: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

// The mocked react-native components are plain strings in the tree, so the tag names are cast
// to the element type findByType expects (the same cast the other component tests use).
const tag = (name: string) => name as unknown as React.ElementType;
const BUTTON = tag('Button');
const TEXT_INPUT = tag('TextInput');
const TEXT = tag('Text');
const active = { origin: 'https://active.example.test', instanceId: 'instance-active', displayName: 'Active', companyName: 'Company' };
let renderer: ReturnType<typeof create> | undefined;
const buttons = () => renderer!.root.findAllByType(BUTTON).map(button => button.props.children);
const button = (label: string) => renderer!.root.findAllByType(BUTTON).find(node => node.props.children === label);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getActiveOperatorServer).mockReturnValue(null);
});
afterEach(async () => {
  if (renderer) await act(async () => { renderer!.unmount(); });
  renderer = undefined;
});

it('keeps only the latest server discovery after overlapping checks', async () => {
  const first = deferred<Awaited<ReturnType<typeof discoverOperator>>>();
  const second = deferred<Awaited<ReturnType<typeof discoverOperator>>>();
  jest.mocked(discoverOperator).mockReset()
    .mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

  await act(async () => { renderer = create(<OperatorServerSelection initial />); });
  const input = () => renderer!.root.findByType(TEXT_INPUT);
  const check = () => button('Check server')!;

  await act(async () => { input().props.onChangeText('https://first.example.test'); check().props.onPress(); });
  await act(async () => { input().props.onChangeText('https://second.example.test'); check().props.onPress(); });
  await act(async () => {
    second.resolve({ server: { origin: 'https://second.example.test', instanceId: 'instance-2', displayName: 'Second', companyName: 'Company' }, config: {} as never });
    await second.promise;
  });
  await act(async () => {
    first.resolve({ server: { origin: 'https://first.example.test', instanceId: 'instance-1', displayName: 'First', companyName: 'Company' }, config: {} as never });
    await first.promise;
  });

  expect(input().props.value).toBe('https://second.example.test');
  expect(renderer!.root.findAllByType(TEXT).map(node => node.props.children)).toContain('Second');
  expect(renderer!.root.findAllByType(TEXT).map(node => node.props.children)).not.toContain('First');
});

it('offers no Back button on a first selection without a cancel handler', async () => {
  await act(async () => { renderer = create(<OperatorServerSelection initial />); });
  expect(buttons()).not.toContain('Back');
});

it('leaves through Back without touching the active server, its session or any draft', async () => {
  jest.mocked(getActiveOperatorServer).mockReturnValue(active);
  const onCancel = jest.fn();
  await act(async () => { renderer = create(<OperatorServerSelection initial onCancel={onCancel} />); });
  await act(async () => { renderer!.root.findByType(TEXT_INPUT).props.onChangeText('https://other.example.test'); });
  await act(async () => { button('Back')!.props.onPress(); });
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(discoverOperator).not.toHaveBeenCalled();
  expect(beginOperatorSwitch).not.toHaveBeenCalled();
  expect(logout).not.toHaveBeenCalled();
  expect(stageOperatorServer).not.toHaveBeenCalled();
  expect(commitStagedOperatorServer).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
});

it('re-selecting the active server while initial returns through onCancel instead of the router', async () => {
  jest.mocked(getActiveOperatorServer).mockReturnValue(active);
  jest.mocked(discoverOperator).mockResolvedValue({ server: active, config: {} as never });
  jest.mocked(beginOperatorSwitch).mockReturnValue(true);
  const onCancel = jest.fn();
  await act(async () => { renderer = create(<OperatorServerSelection initial onCancel={onCancel} />); });
  await act(async () => { renderer!.root.findByType(TEXT_INPUT).props.onChangeText(active.origin); });
  await act(async () => { button('Check server')!.props.onPress(); });
  await act(async () => { button('Use this server')!.props.onPress(); });
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(router.back).not.toHaveBeenCalled();
  expect(logout).not.toHaveBeenCalled();
  expect(stageOperatorServer).not.toHaveBeenCalled();
  expect(commitStagedOperatorServer).not.toHaveBeenCalled();
});

it('re-selecting the active server from the settings route still goes back through the router', async () => {
  jest.mocked(getActiveOperatorServer).mockReturnValue(active);
  jest.mocked(discoverOperator).mockResolvedValue({ server: active, config: {} as never });
  jest.mocked(beginOperatorSwitch).mockReturnValue(true);
  const onCancel = jest.fn();
  await act(async () => { renderer = create(<OperatorServerSelection onCancel={onCancel} />); });
  await act(async () => { renderer!.root.findByType(TEXT_INPUT).props.onChangeText(active.origin); });
  await act(async () => { button('Check server')!.props.onPress(); });
  await act(async () => { button('Use this server')!.props.onPress(); });
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
});

// G-09: "Change warehouse server" inside Settings shows the server in use, has no example
// address and no second language switch; the first-run screen keeps its look.
const devServer = { origin: 'https://warehouse-dev.gurucold.in', displayName: 'Dev', companyName: 'Dev Cold Storage (fictional data)', instanceId: 'i1' };
const allText = () => renderer!.root.findAllByType(TEXT).map(node => [node.props.children].flat(Infinity).join(''));

it('with a current server: shows it, no placeholder, no language switch, no in-body title', async () => {
  await act(async () => { renderer = create(<OperatorServerSelection current={devServer} hideLanguage />); });
  const shown = allText();
  expect(shown).toContain('In use now');
  expect(shown).toContain('Dev Cold Storage (fictional data)');
  expect(shown).toContain('https://warehouse-dev.gurucold.in');
  expect(shown).toContain('Enter the address of the other server (it starts with https://), or scan its QR code.');
  expect(shown).not.toContain('Choose your warehouse server');
  expect(renderer!.root.findAllByType(tag('LanguageSwitch'))).toHaveLength(0);
  const input = renderer!.root.findByType(TEXT_INPUT);
  expect(input.props.placeholder).toBeUndefined();
  expect(input.props.value).toBe('');
  expect(input.props.accessibilityLabel).toBe('Server address');
  // The in-use card does not offer "Use this server".
  expect(buttons()).not.toContain('Use this server');
});

it('first run: no "In use now", the language switch and the title stay, but still no example address', async () => {
  await act(async () => { renderer = create(<OperatorServerSelection initial />); });
  expect(allText()).not.toContain('In use now');
  expect(allText()).toContain('Choose your warehouse server');
  expect(renderer!.root.findAllByType(tag('LanguageSwitch'))).toHaveLength(1);
  expect(renderer!.root.findByType(TEXT_INPUT).props.placeholder).toBeUndefined();
});

it('a network failure says the server could not be checked; the app\'s own message is kept', async () => {
  await act(async () => { renderer = create(<OperatorServerSelection initial />); });
  jest.mocked(discoverOperator).mockRejectedValueOnce(new TypeError('Network request failed'));
  await act(async () => { button('Check server')!.props.onPress(); });
  expect(showAlert).toHaveBeenLastCalledWith('Server unavailable', "Couldn't check this server. Check the address and try again.");
  jest.mocked(discoverOperator).mockRejectedValueOnce(new SyntaxError('Unexpected token < in JSON'));
  await act(async () => { button('Check server')!.props.onPress(); });
  expect(showAlert).toHaveBeenLastCalledWith('Server unavailable', "Couldn't check this server. Check the address and try again.");
  jest.mocked(discoverOperator).mockRejectedValueOnce(new Error('Use an https:// address'));
  await act(async () => { button('Check server')!.props.onPress(); });
  expect(showAlert).toHaveBeenLastCalledWith('Server unavailable', 'Use an https:// address');
});
