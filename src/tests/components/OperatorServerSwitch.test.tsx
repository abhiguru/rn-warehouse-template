import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert } from 'react-native';
import { configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import { OperatorServerSelection } from '@/components/OperatorServerSelection';
import { useAppDispatch } from '@/store/hooks';
import { logout } from '@/store/slices/authSlice';
import grnReducer, { updateHeader as updateGrn } from '@/store/slices/grnFormSlice';
import dispatchReducer, { updateHeader as updateDispatch, saveSnapshot, rollbackToSnapshot, resetForm, setError } from '@/store/slices/dispatchFormSlice';
import invoiceReducer, { updateHeader as updateInvoice } from '@/store/slices/invoiceFormSlice';
import customerReducer, { updateFormData } from '@/store/slices/customerFormSlice';
import ConfigService from '@/services/configService';
import { clearAutocompleteCache } from '@/services/autocomplete-service';
import { queryClient } from '@/lib/queryClient';
import { beginOperatorSwitch, clearPendingEnrollment, endOperatorSwitch, getPendingEnrollmentToken, signOutPendingEnrollment } from '@/config/supabaseConfig';
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
jest.mock('@/store/hooks', () => ({ useAppDispatch: jest.fn() }));
jest.mock('@/store/slices/authSlice', () => ({ logout: jest.fn(() => ({ type: 'test/logout' })) }));
jest.mock('@/services/configService', () => ({ __esModule: true, default: { clearCache: jest.fn() } }));
jest.mock('@/services/autocomplete-service', () => ({ clearAutocompleteCache: jest.fn() }));
jest.mock('@/lib/queryClient', () => ({ queryClient: { isMutating: jest.fn(), cancelQueries: jest.fn(), clear: jest.fn() } }));
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorSwitch: jest.fn(), endOperatorSwitch: jest.fn(),
  clearPendingEnrollment: jest.fn(), getPendingEnrollmentToken: jest.fn(), signOutPendingEnrollment: jest.fn(),
}));
jest.mock('@/config/operatorServer', () => ({
  discoverOperator: jest.fn(), commitStagedOperatorServer: jest.fn(),
  getActiveOperatorServer: jest.fn(), parseOperatorOrigin: jest.fn(), stageOperatorServer: jest.fn(),
}));

const previous = { origin: 'https://first.example.test', instanceId: 'instance-first', displayName: 'Fictional First', companyName: 'Fictional Company' };
const next = { origin: 'https://second.example.test', instanceId: 'instance-second', displayName: 'Fictional Second', companyName: 'Fictional Company' };
const makeStore = () => configureStore({ reducer: {
  grn: grnReducer, dispatch: dispatchReducer, invoice: invoiceReducer, customer: customerReducer,
} });
let store: ReturnType<typeof makeStore>;
let emptyState: ReturnType<typeof store.getState>;
let renderer: ReturnType<typeof create> | undefined;
let events: string[];

beforeEach(() => {
  jest.resetAllMocks();
  store = makeStore();
  emptyState = store.getState();
  store.dispatch(updateGrn({ customer_name: 'Unsaved fictional GRN' }));
  store.dispatch(updateDispatch({ customer_name: 'Unsaved fictional dispatch' }));
  store.dispatch(saveSnapshot());
  store.dispatch(setError('Fictional previous warehouse error'));
  store.dispatch(updateInvoice({ customer_name: 'Unsaved fictional invoice' }));
  store.dispatch(updateFormData({ name: 'Unsaved fictional customer' }));
  events = [];
  jest.mocked(logout).mockReturnValue({ type: 'test/logout' } as never);
  jest.mocked(useAppDispatch).mockReturnValue(((action: { type: string }) => {
    if (action.type === 'test/logout') return { unwrap: async () => { events.push('logout'); } };
    return store.dispatch(action);
  }) as ReturnType<typeof useAppDispatch>);
  jest.mocked(discoverOperator).mockResolvedValue({ server: next, config: {} as never });
  jest.mocked(getActiveOperatorServer).mockReturnValue(previous);
  jest.mocked(beginOperatorSwitch).mockReturnValue(true);
  jest.mocked(queryClient.isMutating).mockReturnValue(0);
  jest.mocked(stageOperatorServer).mockImplementation(async () => { events.push('stage'); });
  jest.mocked(queryClient.cancelQueries).mockImplementation(async () => { events.push('cancel queries'); });
  jest.mocked(queryClient.clear).mockImplementation(() => { events.push('clear queries'); });
  jest.mocked(clearAutocompleteCache).mockImplementation(() => { events.push('clear autocomplete'); });
  jest.mocked(ConfigService.clearCache).mockImplementation(async () => { events.push('clear config'); });
  jest.mocked(commitStagedOperatorServer).mockImplementation(async () => {
    // All real form reducers must have cleared old data before the new origin commits.
    expect(store.getState()).toEqual(emptyState);
    events.push('commit');
  });
});

afterEach(async () => {
  if (renderer) await act(async () => { renderer!.unmount(); });
  renderer = undefined;
});

const button = (label: string) => renderer!.root.findAllByType('Button').find(node => node.props.children === label)!;
async function choose(initial = false) {
  await act(async () => { renderer = create(<OperatorServerSelection initial={initial} />); });
  await act(async () => { renderer!.root.findByType('TextInput').props.onChangeText(next.origin); });
  await act(async () => { button('Check server').props.onPress(); });
  await act(async () => { button('Use this server').props.onPress(); });
}
function confirmation() {
  const call = jest.mocked(Alert.alert).mock.calls.find(([title]) => title === 'Change Warehouse Server');
  expect(call).toBeDefined();
  expect(call![1]).toMatch(/sign.*out/i);
  expect(call![1]).toMatch(/unsaved forms/i);
  return call![2]!;
}
async function confirm() {
  const change = confirmation().find(action => action.text === 'Change server');
  expect(change?.onPress).toBeDefined();
  await act(async () => { change!.onPress!(); });
}

it('keeps every unsaved form and session when changing warehouses is cancelled', async () => {
  const drafts = store.getState();
  await choose();
  const cancel = confirmation().find(action => action.text === 'Cancel');
  expect(cancel?.style).toBe('cancel');
  await act(async () => { cancel?.onPress?.(); });
  expect(store.getState()).toEqual(drafts);
  expect(beginOperatorSwitch).not.toHaveBeenCalled();
  expect(logout).not.toHaveBeenCalled();
  expect(stageOperatorServer).not.toHaveBeenCalled();
  expect(commitStagedOperatorServer).not.toHaveBeenCalled();
});

it.each(['different origin', 'replacement at the same origin'])('clears old forms and caches before committing a %s', async kind => {
  const target = kind === 'different origin' ? next : { ...next, origin: previous.origin };
  jest.mocked(discoverOperator).mockResolvedValue({ server: target, config: {} as never });
  jest.mocked(getPendingEnrollmentToken).mockResolvedValue('fictional-pending-token');
  jest.mocked(signOutPendingEnrollment).mockImplementation(async () => { events.push('pending signout'); });
  jest.mocked(clearPendingEnrollment).mockImplementation(async () => { events.push('pending clear'); });
  await choose();
  expect(events).toEqual([]);
  await confirm();
  expect(events).toEqual(['stage', 'logout', kind === 'different origin' ? 'pending signout' : 'pending clear', 'cancel queries', 'clear queries', 'clear autocomplete', 'clear config', 'commit']);
  expect(logout).toHaveBeenCalledWith(kind === 'different origin' ? undefined : { localOnly: true });
  if (kind === 'replacement at the same origin') expect(signOutPendingEnrollment).not.toHaveBeenCalled();
  expect(commitStagedOperatorServer).toHaveBeenCalledWith(target);
  expect(router.replace).toHaveBeenCalledWith('/login');
  expect(endOperatorSwitch).toHaveBeenCalledTimes(1);
  store.dispatch(rollbackToSnapshot());
  expect(store.getState()).toEqual(emptyState);
});

it('keeps the same instance and its drafts without a confirmation or logout', async () => {
  jest.mocked(discoverOperator).mockResolvedValue({ server: previous, config: {} as never });
  const drafts = store.getState();
  await choose();
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(store.getState()).toEqual(drafts);
  expect(logout).not.toHaveBeenCalled();
  expect(stageOperatorServer).not.toHaveBeenCalled();
  expect(router.back).toHaveBeenCalledTimes(1);
});

it('allows first selection without an old-warehouse warning', async () => {
  jest.mocked(getActiveOperatorServer).mockReturnValue(null);
  await choose(true);
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(commitStagedOperatorServer).toHaveBeenCalledWith(next);
  expect(events).toContain('commit');
});

it.each(['query mutation', 'tracked mutation'])('checks for a new %s again after confirmation', async kind => {
  const drafts = store.getState();
  await choose();
  if (kind === 'query mutation') jest.mocked(queryClient.isMutating).mockReturnValue(1);
  else jest.mocked(beginOperatorSwitch).mockReturnValue(false);
  await confirm();
  expect(Alert.alert).toHaveBeenLastCalledWith('Operation In Progress', expect.any(String));
  expect(store.getState()).toEqual(drafts);
  expect(stageOperatorServer).not.toHaveBeenCalled();
  expect(logout).not.toHaveBeenCalled();
});

it('ignores an old confirmation after the server input changes', async () => {
  const drafts = store.getState();
  await choose();
  const change = confirmation().find(action => action.text === 'Change server')!;
  await act(async () => { renderer!.root.findByType('TextInput').props.onChangeText('https://third.example.test'); });
  await act(async () => { change.onPress!(); });
  expect(store.getState()).toEqual(drafts);
  expect(beginOperatorSwitch).not.toHaveBeenCalled();
  expect(logout).not.toHaveBeenCalled();
});

it('does not activate an old confirmation after the selection screen unmounts', async () => {
  await choose();
  const change = confirmation().find(action => action.text === 'Change server')!;
  await act(async () => { renderer!.unmount(); });
  renderer = undefined;
  await act(async () => { change.onPress!(); });
  expect(beginOperatorSwitch).not.toHaveBeenCalled();
  expect(logout).not.toHaveBeenCalled();
});

it('does not log out or discard forms when staging the destination fails', async () => {
  jest.mocked(stageOperatorServer).mockRejectedValue(new Error('fictional storage failure'));
  const drafts = store.getState();
  await choose();
  await confirm();
  expect(Alert.alert).toHaveBeenLastCalledWith('Switch Failed', 'The current server was kept. Please try again.');
  expect(store.getState()).toEqual(drafts);
  expect(logout).not.toHaveBeenCalled();
  expect(commitStagedOperatorServer).not.toHaveBeenCalled();
  expect(endOperatorSwitch).toHaveBeenCalledTimes(1);
});

it('prevents a full form reset from retaining a previous warehouse snapshot or error', () => {
  store.dispatch(resetForm());
  expect(store.getState().dispatch).toEqual(emptyState.dispatch);
  store.dispatch(rollbackToSnapshot());
  expect(store.getState().dispatch).toEqual(emptyState.dispatch);
});
