import React from 'react';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { OperatorServerSelection } from '@/components/OperatorServerSelection';
import { logout } from '@/store/slices/authSlice';
import { showAlert } from '@/utils/alert';
import { beginOperatorSwitch } from '@/config/supabaseConfig';
import { AppTooOldError } from '@/config/appTooOld';
import { commitStagedOperatorServer, discoverOperator, getActiveOperatorServer, stageOperatorServer } from '@/config/operatorServer';

// The theme reads the build's brand pack from expo-constants (WH-141); this test replaces react-native wholesale, so give it a plain config.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));
jest.mock('react-native', () => {
  const React = require('react');
  function flatten(style: unknown): unknown {
    return Array.isArray(style) ? Object.assign({}, ...style.map(entry => flatten(entry) as object)) : style ?? {};
  }
  const element = (name: string) => ({ children, ...props }: Record<string, unknown>) =>
    React.createElement(name, props, children);
  return {
    View: element('View'), Text: element('Text'), TextInput: element('TextInput'),
    Modal: element('Modal'), ActivityIndicator: element('ActivityIndicator'),
    ScrollView: element('ScrollView'), KeyboardAvoidingView: element('KeyboardAvoidingView'),
    Keyboard: { dismiss: jest.fn() },
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.default },
    // flatten is for Testing Library, which reads styles to find what is hidden.
    Alert: { alert: jest.fn() }, StyleSheet: { create: (styles: unknown) => styles, flatten },
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
  // The stand-in draws what a person finds: a pressable with the button role and its label as text.
  return {
    Button: ({ children, ...props }: Record<string, unknown>) =>
      React.createElement('View', { ...props, accessible: true, accessibilityRole: 'button' }, React.createElement('Text', null, children)),
  };
});
jest.mock('@/store/hooks', () => ({ useAppDispatch: () => jest.fn() }));
// The language switch has its own controls and store access; it is not under test here.
jest.mock('@/components/LanguageSwitch', () => ({
  LanguageSwitch: () => require('react').createElement('LanguageSwitch'),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
// The screen has its own tests (src/components/__tests__/AppTooOldAndUpgrading.test.tsx); here only that it is shown.
jest.mock('@/components/AppTooOldScreen', () => ({
  __esModule: true,
  default: ({ onClose, ...props }: Record<string, unknown>) => require('react').createElement('AppTooOldScreen', { ...props, onClose }),
}));
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

const active = { origin: 'https://active.example.test', instanceId: 'instance-active', displayName: 'Active', companyName: 'Company' };
const user = userEvent.setup({ delay: 0 });
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
// react-native is replaced wholesale, so the server field and the stand-ins below are plain host elements.
const input = () => screen.getByLabelText('Server address');
const button = (label: string) => screen.getByRole('button', { name: label });
const hasButton = (label: string) => screen.queryByRole('button', { name: label, ...hidden }) !== null;
const check = () => user.press(button('Check server'));
const typeAddress = async (text: string) => { await fireEvent.changeText(input(), text); };
/** The host elements a stand-in draws that have no role or text (found by their type). */
const standIns = (name: string) => {
  const root = screen.root;
  return root ? [root, ...root.queryAll(() => true)].filter(node => (node.type as unknown) === name) : [];
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getActiveOperatorServer).mockReturnValue(null);
});

it('keeps only the latest server discovery after overlapping checks', async () => {
  const first = deferred<Awaited<ReturnType<typeof discoverOperator>>>();
  const second = deferred<Awaited<ReturnType<typeof discoverOperator>>>();
  jest.mocked(discoverOperator).mockReset()
    .mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

  await render(<OperatorServerSelection initial />);

  await typeAddress('https://first.example.test');
  await check();
  await typeAddress('https://second.example.test');
  await check();
  await act(async () => {
    second.resolve({ server: { origin: 'https://second.example.test', instanceId: 'instance-2', displayName: 'Second', companyName: 'Company' }, config: {} as never });
    await second.promise;
  });
  await act(async () => {
    first.resolve({ server: { origin: 'https://first.example.test', instanceId: 'instance-1', displayName: 'First', companyName: 'Company' }, config: {} as never });
    await first.promise;
  });

  expect(input()).toHaveDisplayValue('https://second.example.test');
  expect(screen.getByText('Second')).toBeOnTheScreen();
  expect(screen.queryByText('First', hidden)).not.toBeOnTheScreen();
});

it('offers no Back button on a first selection without a cancel handler', async () => {
  await render(<OperatorServerSelection initial />);
  expect(screen.getByRole('button', { name: 'Check server' })).toBeOnTheScreen();
  expect(hasButton('Back')).toBe(false);
});

it('leaves through Back without touching the active server, its session or any draft', async () => {
  jest.mocked(getActiveOperatorServer).mockReturnValue(active);
  const onCancel = jest.fn();
  await render(<OperatorServerSelection initial onCancel={onCancel} />);
  await typeAddress('https://other.example.test');
  await user.press(button('Back'));
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
  await render(<OperatorServerSelection initial onCancel={onCancel} />);
  await typeAddress(active.origin);
  await check();
  await user.press(await screen.findByRole('button', { name: 'Use this server' }));
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
  await render(<OperatorServerSelection onCancel={onCancel} />);
  await typeAddress(active.origin);
  await check();
  await user.press(await screen.findByRole('button', { name: 'Use this server' }));
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
});

// G-09: "Change warehouse server" inside Settings shows the server in use, has no example
// address and no second language switch; the first-run screen keeps its look.
const devServer = { origin: 'https://warehouse-dev.gurucold.in', displayName: 'Dev', companyName: 'Dev Cold Storage (fictional data)', instanceId: 'i1' };

it('with a current server: shows it, no placeholder, no language switch, no in-body title', async () => {
  await render(<OperatorServerSelection current={devServer} hideLanguage />);
  expect(screen.getByText('In use now')).toBeOnTheScreen();
  expect(screen.getByText('Dev Cold Storage (fictional data)')).toBeOnTheScreen();
  expect(screen.getByText('https://warehouse-dev.gurucold.in')).toBeOnTheScreen();
  expect(screen.getByText('Enter the address of the other server (it starts with https://), or scan its QR code.')).toBeOnTheScreen();
  expect(screen.queryByText('Choose your warehouse server', hidden)).not.toBeOnTheScreen();
  expect(standIns('LanguageSwitch')).toHaveLength(0);
  expect(input().props.placeholder).toBeUndefined();
  expect(input()).toHaveDisplayValue('');
  expect(input()).toHaveAccessibleName('Server address');
  // The in-use card does not offer "Use this server".
  expect(hasButton('Use this server')).toBe(false);
});

it('first run: no "In use now", the language switch and the title stay, but still no example address', async () => {
  await render(<OperatorServerSelection initial />);
  expect(screen.queryByText('In use now', hidden)).not.toBeOnTheScreen();
  expect(screen.getByText('Choose your warehouse server')).toBeOnTheScreen();
  expect(standIns('LanguageSwitch')).toHaveLength(1);
  expect(input().props.placeholder).toBeUndefined();
});

it('a network failure says the server could not be checked; the app\'s own message is kept', async () => {
  await render(<OperatorServerSelection initial />);
  jest.mocked(discoverOperator).mockRejectedValueOnce(new TypeError('Network request failed'));
  await check();
  expect(showAlert).toHaveBeenLastCalledWith('Server unavailable', "Couldn't check this server. Check the address and try again.");
  jest.mocked(discoverOperator).mockRejectedValueOnce(new SyntaxError('Unexpected token < in JSON'));
  await check();
  expect(showAlert).toHaveBeenLastCalledWith('Server unavailable', "Couldn't check this server. Check the address and try again.");
  jest.mocked(discoverOperator).mockRejectedValueOnce(new Error('Use an https:// address'));
  await check();
  expect(showAlert).toHaveBeenLastCalledWith('Server unavailable', 'Use an https:// address');
});

it('a facility that needs a newer app shows the "Update the app" screen, not an alert; Back returns to the field', async () => {
  await render(<OperatorServerSelection initial />);
  jest.mocked(showAlert).mockClear();
  jest.mocked(discoverOperator).mockRejectedValueOnce(new AppTooOldError('requires 0.7.0', '0.7.0', '0.6.0', 'https://updates.example.test/app.apk'));
  await check();
  // The stand-in of the screen draws a host element with the props it was given.
  const tooOld = standIns('AppTooOldScreen');
  expect(tooOld).toHaveLength(1);
  expect(tooOld[0].props).toMatchObject({ minimum: '0.7.0', current: '0.6.0', updateUrl: 'https://updates.example.test/app.apk' });
  expect(showAlert).not.toHaveBeenCalled();
  await act(async () => { tooOld[0].props.onClose(); });
  expect(standIns('AppTooOldScreen')).toHaveLength(0);
  expect(button('Check server')).toBeOnTheScreen();
});
