import React from 'react';
import { act, create } from 'react-test-renderer';
import { router } from 'expo-router';
import { OperatorServerSelection } from '@/components/OperatorServerSelection';
import { logout } from '@/store/slices/authSlice';
import { beginOperatorSwitch } from '@/config/supabaseConfig';
import { commitStagedOperatorServer, discoverOperator, getActiveOperatorServer, stageOperatorServer } from '@/config/operatorServer';

jest.mock('react-native', () => {
  const React = require('react');
  const element = (name: string) => ({ children, ...props }: Record<string, unknown>) =>
    React.createElement(name, props, children);
  return {
    View: element('View'), Text: element('Text'), TextInput: element('TextInput'),
    Modal: element('Modal'), ActivityIndicator: element('ActivityIndicator'),
    Alert: { alert: jest.fn() }, StyleSheet: { create: (styles: unknown) => styles },
  };
});
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: true }, jest.fn()] }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn() } }));
jest.mock('@/components/ui/Button', () => {
  const React = require('react');
  return { Button: ({ children, ...props }: Record<string, unknown>) => React.createElement('Button', props, children) };
});
jest.mock('@/store/hooks', () => ({ useAppDispatch: () => jest.fn() }));
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

const active = { origin: 'https://active.example.test', instanceId: 'instance-active', displayName: 'Active', companyName: 'Company' };
let renderer: ReturnType<typeof create> | undefined;
const buttons = () => renderer!.root.findAllByType('Button').map(button => button.props.children);
const button = (label: string) => renderer!.root.findAllByType('Button').find(node => node.props.children === label);

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
  const input = () => renderer!.root.findByType('TextInput');
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
  expect(renderer!.root.findAllByType('Text').map(node => node.props.children)).toContain('Second');
  expect(renderer!.root.findAllByType('Text').map(node => node.props.children)).not.toContain('First');
});

it('offers no Back button on a first selection without a cancel handler', async () => {
  await act(async () => { renderer = create(<OperatorServerSelection initial />); });
  expect(buttons()).not.toContain('Back');
});

it('leaves through Back without touching the active server, its session or any draft', async () => {
  jest.mocked(getActiveOperatorServer).mockReturnValue(active);
  const onCancel = jest.fn();
  await act(async () => { renderer = create(<OperatorServerSelection initial onCancel={onCancel} />); });
  await act(async () => { renderer!.root.findByType('TextInput').props.onChangeText('https://other.example.test'); });
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
  await act(async () => { renderer!.root.findByType('TextInput').props.onChangeText(active.origin); });
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
  await act(async () => { renderer!.root.findByType('TextInput').props.onChangeText(active.origin); });
  await act(async () => { button('Check server')!.props.onPress(); });
  await act(async () => { button('Use this server')!.props.onPress(); });
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
});
