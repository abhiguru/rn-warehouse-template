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
import { recentSearches, rememberSearch } from '@/features/filters/recentSearches';

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

// A reset form is dated "now" (the default dispatch date), so the clock is held
// still: only then is a reset store exactly equal to a fresh one. Timers are
// left real; only Date is fixed.
beforeAll(() => {
  jest.useFakeTimers({
    now: new Date('2026-10-10T06:00:00Z'),
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
      'setTimeout', 'clearTimeout',
    ],
  });
});
afterAll(() => jest.useRealTimers());

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

// Review 2026-10-10, M2-11: these are keyed by user or customer id only, and a
// forced logout or server switch does not run the logout button's own cleanup.
it('removes the recent-customer, recent-sender and recent-item lists of the ended session', async () => {
  const store = makeStore();
  await AsyncStorage.multiSet([
    ['recent_customers_user-a', '[{"id":"c1","name":"Fictional Traders"}]'],
    ['recent_customers', '[]'],
    ['recent_senders_user-a', '[{"name":"Fictional Sender"}]'],
    ['session_recent_items_customer-1', '{"items":[{"gr_no":"A0010"}]}'],
    ['operator_server_v1', '{"origin":"https://warehouse.example.test"}'],
    ['app_language', 'gu'],
  ]);
  await clearSessionScopedState(store.dispatch);
  expect((await AsyncStorage.getAllKeys()).sort()).toEqual(['app_language', 'operator_server_v1']);
});

// M4-1: the "Recent" list under a search field is module state beside the filter slice.
it('forgets the recent searches of every list', async () => {
  rememberSearch('grn', 'Fictional Traders A0042');
  rememberSearch('dispatch', 'DD0010');
  expect(recentSearches('grn')).toEqual(['Fictional Traders A0042']);

  await clearSessionScopedState(makeStore().dispatch);

  expect(recentSearches('grn')).toEqual([]);
  expect(recentSearches('dispatch')).toEqual([]);
});
