import React from 'react';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { Keyboard, Platform } from 'react-native';
import { OperatorServerSelection } from '@/components/OperatorServerSelection';
import { discoverOperator, getActiveOperatorServer } from '@/config/operatorServer';

// The keyboard on the server address screen: a check closes it so the result card is not
// covered, and the scrolling container keeps the "Use this server" tap to one tap.

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
// The "Update the app" screen has its own tests; it is not rendered here.
jest.mock('@/components/AppTooOldScreen', () => ({ __esModule: true, default: () => null }));
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
jest.mock('@/components/LanguageSwitch', () => ({ LanguageSwitch: () => null }));
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
const user = userEvent.setup({ delay: 0 });
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
// react-native is replaced wholesale: the scroll view and the keyboard-avoiding view are plain host elements with
// no role or text, so they are found by their type.
const hostsOf = (name: string) => {
  const root = screen.root;
  return root ? [root, ...root.queryAll(() => true)].filter(node => (node.type as unknown) === name) : [];
};

const input = () => screen.getByLabelText('Server address');
const typeAddress = async (text: string) => { await fireEvent.changeText(input(), text); };
const checkServer = () => user.press(screen.getByRole('button', { name: 'Check server' }));
const hasUseThisServer = () => screen.queryByRole('button', { name: 'Use this server', ...hidden }) !== null;
const draw = async (props: React.ComponentProps<typeof OperatorServerSelection> = { initial: true }) => {
  await render(<OperatorServerSelection {...props} />);
};

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as { OS: string }).OS = 'ios';
  jest.mocked(getActiveOperatorServer).mockReturnValue(null);
});

describe('closing the keyboard when a check starts', () => {
  it('closes it when "Check server" is pressed, before the result arrives, and shows the card afterwards', async () => {
    const pending = deferred<Discovery>();
    jest.mocked(discoverOperator).mockReturnValueOnce(pending.promise);
    await draw();
    await typeAddress('https://found.example.test');
    expect(Keyboard.dismiss).not.toHaveBeenCalled();

    await checkServer();

    expect(discoverOperator).toHaveBeenCalledWith('https://found.example.test');
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Fictional Found', hidden)).not.toBeOnTheScreen();

    await act(async () => { pending.resolve(found); await pending.promise; });
    expect(screen.getByText('Fictional Found')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Use this server' })).toBeOnTheScreen();
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
  });

  it('closes it and runs the same check when the keyboard\'s submit key is used in the field', async () => {
    jest.mocked(discoverOperator).mockResolvedValueOnce(found);
    await draw();
    await typeAddress('https://found.example.test');
    expect(Keyboard.dismiss).not.toHaveBeenCalled();

    await fireEvent(input(), 'submitEditing');

    expect(discoverOperator).toHaveBeenCalledTimes(1);
    expect(discoverOperator).toHaveBeenCalledWith('https://found.example.test');
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Fictional Found')).toBeOnTheScreen();
  });

  it('closes it when the check fails too, so the error alert is not behind it', async () => {
    jest.mocked(discoverOperator).mockRejectedValueOnce(new Error('Fictional unreachable server'));
    await draw();
    await typeAddress('https://down.example.test');
    await checkServer();
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(hasUseThisServer()).toBe(false);
  });

  it.each([
    ['initial selection', { initial: true }],
    ['change of server', {}],
    ['central "Enter address"', { onCancel: jest.fn(), onChoose: jest.fn() }],
  ])('closes it in the %s', async (_name, props) => {
    jest.mocked(discoverOperator).mockResolvedValueOnce(found);
    await draw(props);
    await typeAddress('https://found.example.test');
    await checkServer();
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Use this server' })).toBeOnTheScreen();
  });

  it('closes it once for a submit that starts a check, and not again for a submit while that check runs', async () => {
    const pending = deferred<Discovery>();
    jest.mocked(discoverOperator).mockReturnValueOnce(pending.promise);
    await draw();
    await typeAddress('https://found.example.test');
    await fireEvent(input(), 'submitEditing');
    await fireEvent(input(), 'submitEditing');
    expect(discoverOperator).toHaveBeenCalledTimes(1);
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(found); await pending.promise; });
  });
});

describe('scrolling with the keyboard open', () => {
  it('keeps taps on "Use this server" working with the keyboard open (one tap, no first tap to close it)', async () => {
    jest.mocked(discoverOperator).mockResolvedValueOnce(found);
    await draw({ onCancel: jest.fn(), onChoose: jest.fn() });
    await typeAddress('https://found.example.test');
    await checkServer();
    expect(hostsOf('ScrollView')).toHaveLength(1);
    expect(hostsOf('ScrollView')[0].props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('moves the content above the keyboard with padding on iOS', async () => {
    await draw();
    const avoiding = hostsOf('KeyboardAvoidingView');
    expect(avoiding).toHaveLength(1);
    expect(avoiding[0].props.behavior).toBe('padding');
    expect(avoiding[0].queryAll(node => (node.type as unknown) === 'ScrollView')).toHaveLength(1);
  });

  it('shrinks the content above the keyboard on Android, as the sign-in screens do', async () => {
    (Platform as { OS: string }).OS = 'android';
    await draw();
    const avoiding = hostsOf('KeyboardAvoidingView');
    expect(avoiding).toHaveLength(1);
    expect(avoiding[0].props.behavior).toBe('height');
    expect(avoiding[0].queryAll(node => (node.type as unknown) === 'ScrollView')).toHaveLength(1);
  });
});
