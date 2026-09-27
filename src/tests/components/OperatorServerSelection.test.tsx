import React from 'react';
import { act, create } from 'react-test-renderer';
import { OperatorServerSelection } from '@/components/OperatorServerSelection';
import { discoverOperator } from '@/config/operatorServer';

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
jest.mock('@/services/autocomplete-service', () => ({ clearAutocompleteCache: jest.fn() }));
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

it('keeps only the latest server discovery after overlapping checks', async () => {
  const first = deferred<Awaited<ReturnType<typeof discoverOperator>>>();
  const second = deferred<Awaited<ReturnType<typeof discoverOperator>>>();
  jest.mocked(discoverOperator).mockReset()
    .mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OperatorServerSelection initial />); });
  const input = () => renderer.root.findByType('TextInput');
  const check = () => renderer.root.findAllByType('Button').find(button => button.props.children === 'Check server')!;

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
  expect(renderer.root.findAllByType('Text').map(node => node.props.children)).toContain('Second');
  expect(renderer.root.findAllByType('Text').map(node => node.props.children)).not.toContain('First');
  await act(async () => { renderer.unmount(); });
});
