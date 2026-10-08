import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import grnReducer, { updateHeader as updateGrn } from '../slices/grnFormSlice';
import dispatchReducer, { updateHeader as updateDispatch, saveSnapshot, setError } from '../slices/dispatchFormSlice';
import invoiceReducer, { updateHeader as updateInvoice } from '../slices/invoiceFormSlice';
import customerReducer, { updateFormData } from '../slices/customerFormSlice';
import { CACHE_PREFIXES } from '@/config/cacheConfig';
import { queryClient } from '@/lib/queryClient';
import { clearAutocompleteCache } from '@/services/autocomplete-service';
import { sweepSharedDocuments } from '@/utils/shareDocument';
import { clearSessionScopedState } from '../sessionScopedState';

jest.mock('@/lib/queryClient', () => ({
  queryClient: { cancelQueries: jest.fn(async () => {}), clear: jest.fn() },
}));
jest.mock('@/services/autocomplete-service', () => ({ clearAutocompleteCache: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ sweepSharedDocuments: jest.fn(async () => {}) }));
jest.mock('@/config/supabaseConfig', () => ({ getSessionIdentity: jest.fn() }));

const makeStore = () =>
  configureStore({
    reducer: { grnForm: grnReducer, dispatchForm: dispatchReducer, invoiceForm: invoiceReducer, customerForm: customerReducer },
  });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

it('clears queries, autocomplete, every form draft, every list cache and shared documents', async () => {
  const store = makeStore();
  const empty = store.getState();
  store.dispatch(updateGrn({ customer_name: 'Unsaved fictional GRN' }));
  store.dispatch(updateDispatch({ customer_name: 'Unsaved fictional dispatch' }));
  store.dispatch(saveSnapshot());
  store.dispatch(setError('Fictional previous warehouse error'));
  store.dispatch(updateInvoice({ customer_name: 'Unsaved fictional invoice' }));
  store.dispatch(updateFormData({ name: 'Unsaved fictional customer' }));
  expect(store.getState()).not.toEqual(empty);

  const scope = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
  for (const prefix of Object.values(CACHE_PREFIXES)) {
    await AsyncStorage.setItem(`${prefix}_${scope}_all_20_0`, '{"data":[]}');
    await AsyncStorage.setItem(`${prefix}_legacy`, '{"data":[]}');
  }
  await AsyncStorage.setItem('operator_server_v1', '{"origin":"https://warehouse.example.test"}');
  await AsyncStorage.setItem('persist:root', '{}');

  await clearSessionScopedState(store.dispatch);

  expect(store.getState()).toEqual(empty);
  const remaining = await AsyncStorage.getAllKeys();
  expect(remaining.sort()).toEqual(['operator_server_v1', 'persist:root']);
  expect(queryClient.cancelQueries).toHaveBeenCalledTimes(1);
  expect(queryClient.clear).toHaveBeenCalledTimes(1);
  expect(jest.mocked(queryClient.cancelQueries).mock.invocationCallOrder[0])
    .toBeLessThan(jest.mocked(queryClient.clear).mock.invocationCallOrder[0]);
  expect(clearAutocompleteCache).toHaveBeenCalledTimes(1);
  expect(sweepSharedDocuments).toHaveBeenCalledTimes(1);
});

it('completes the teardown even when the shared document sweep fails', async () => {
  const store = makeStore();
  const empty = store.getState();
  store.dispatch(updateGrn({ customer_name: 'Unsaved fictional GRN' }));
  await AsyncStorage.setItem(`${CACHE_PREFIXES.DISPATCH_LIST}_x`, '{}');
  jest.mocked(sweepSharedDocuments).mockRejectedValueOnce(new Error('fictional filesystem failure'));
  await expect(clearSessionScopedState(store.dispatch)).resolves.toBeUndefined();
  expect(sweepSharedDocuments).toHaveBeenCalledTimes(1);
  expect(store.getState()).toEqual(empty);
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
});
