import React from 'react';
import { act, create } from 'react-test-renderer';
import { Keyboard, Platform } from 'react-native';
import { OperatorServerSelection } from '@/components/OperatorServerSelection';
import { discoverOperator, getActiveOperatorServer } from '@/config/operatorServer';

// The keyboard on the server address screen: a check closes it so the result card is not
// covered, and the scrolling container keeps the "Use this server" tap to one tap.

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
jest.mock('@/components/LanguageSwitch', () => ({ LanguageSwitch: () => null }));
jest.mock('@/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({ language: 'en', preference: 'system', setPreference: jest.fn() }),
}));
jest.mock('@/store/slices/authSlice', () => ({ logout: jest.fn() }));
jest.mock('@/store/slices/grnFormSlice', () => ({ resetForm: jest.fn() }));
jest.mock('@/store/slices/dispatchFormSlice', () => ({ resetForm: jest.fn() }));
jest.mock('@/store/slices/invoiceFormSlice', () => ({ resetForm: jest.fn() }));
jest.mock('@/store/slices/customerFormSlice', () => ({ resetForm: jest.fn() }));
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

type Discovery = Awaited<ReturnType<typeof discoverOperator>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

const found: Discovery = {
  server: { origin: 'https://found.example.test', instanceId: 'instance-found', displayName: 'Fictional Found', companyName: 'Fictional Company' },
  config: {} as never,
};
let renderer: ReturnType<typeof create> | undefined;
const input = () => renderer!.root.findByType('TextInput');
const button = (label: string) => renderer!.root.findAllByType('Button').find(node => node.props.children === label);
const texts = () => renderer!.root.findAllByType('Text').map(node => node.props.children);
const render = async (props: React.ComponentProps<typeof OperatorServerSelection> = { initial: true }) => {
  await act(async () => { renderer = create(<OperatorServerSelection {...props} />); });
};

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as { OS: string }).OS = 'ios';
  jest.mocked(getActiveOperatorServer).mockReturnValue(null);
});
afterEach(async () => {
  if (renderer) await act(async () => { renderer!.unmount(); });
  renderer = undefined;
});

describe('closing the keyboard when a check starts', () => {
  it('closes it when "Check server" is pressed, before the result arrives, and shows the card afterwards', async () => {
    const pending = deferred<Discovery>();
    jest.mocked(discoverOperator).mockReturnValueOnce(pending.promise);
    await render();
    await act(async () => { input().props.onChangeText('https://found.example.test'); });
    expect(Keyboard.dismiss).not.toHaveBeenCalled();

    await act(async () => { button('Check server')!.props.onPress(); });

    expect(discoverOperator).toHaveBeenCalledWith('https://found.example.test');
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(texts()).not.toContain('Fictional Found');

    await act(async () => { pending.resolve(found); await pending.promise; });
    expect(texts()).toContain('Fictional Found');
    expect(button('Use this server')).toBeDefined();
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
  });

  it('closes it and runs the same check when the keyboard\'s submit key is used in the field', async () => {
    jest.mocked(discoverOperator).mockResolvedValueOnce(found);
    await render();
    await act(async () => { input().props.onChangeText('https://found.example.test'); });
    expect(Keyboard.dismiss).not.toHaveBeenCalled();

    await act(async () => { input().props.onSubmitEditing(); });

    expect(discoverOperator).toHaveBeenCalledTimes(1);
    expect(discoverOperator).toHaveBeenCalledWith('https://found.example.test');
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(texts()).toContain('Fictional Found');
  });

  it('closes it when the check fails too, so the error alert is not behind it', async () => {
    jest.mocked(discoverOperator).mockRejectedValueOnce(new Error('Fictional unreachable server'));
    await render();
    await act(async () => { input().props.onChangeText('https://down.example.test'); });
    await act(async () => { button('Check server')!.props.onPress(); });
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(button('Use this server')).toBeUndefined();
  });

  it.each([
    ['initial selection', { initial: true }],
    ['change of server', {}],
    ['central "Enter address"', { onCancel: jest.fn(), onChoose: jest.fn() }],
  ])('closes it in the %s', async (_name, props) => {
    jest.mocked(discoverOperator).mockResolvedValueOnce(found);
    await render(props);
    await act(async () => { input().props.onChangeText('https://found.example.test'); });
    await act(async () => { button('Check server')!.props.onPress(); });
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(button('Use this server')).toBeDefined();
  });

  it('closes it once for a submit that starts a check, and not again for a submit while that check runs', async () => {
    const pending = deferred<Discovery>();
    jest.mocked(discoverOperator).mockReturnValueOnce(pending.promise);
    await render();
    await act(async () => { input().props.onChangeText('https://found.example.test'); });
    await act(async () => { input().props.onSubmitEditing(); });
    await act(async () => { input().props.onSubmitEditing(); });
    expect(discoverOperator).toHaveBeenCalledTimes(1);
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(found); await pending.promise; });
  });
});

describe('scrolling with the keyboard open', () => {
  it('keeps taps on "Use this server" working with the keyboard open (one tap, no first tap to close it)', async () => {
    jest.mocked(discoverOperator).mockResolvedValueOnce(found);
    await render({ onCancel: jest.fn(), onChoose: jest.fn() });
    await act(async () => { input().props.onChangeText('https://found.example.test'); });
    await act(async () => { button('Check server')!.props.onPress(); });
    expect(renderer!.root.findByType('ScrollView').props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('moves the content above the keyboard with padding on iOS', async () => {
    await render();
    const avoiding = renderer!.root.findByType('KeyboardAvoidingView');
    expect(avoiding.props.behavior).toBe('padding');
    expect(avoiding.findAllByType('ScrollView')).toHaveLength(1);
  });

  it('shrinks the content above the keyboard on Android, as the sign-in screens do', async () => {
    (Platform as { OS: string }).OS = 'android';
    await render();
    const avoiding = renderer!.root.findByType('KeyboardAvoidingView');
    expect(avoiding.props.behavior).toBe('height');
    expect(avoiding.findAllByType('ScrollView')).toHaveLength(1);
  });
});
