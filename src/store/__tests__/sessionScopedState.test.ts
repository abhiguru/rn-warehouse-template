import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import grnReducer, { updateHeader as updateGrn } from '../slices/grnFormSlice';
import dispatchReducer, { updateHeader as updateDispatch, saveSnapshot, setError } from '../slices/dispatchFormSlice';
import invoiceReducer, { updateHeader as updateInvoice } from '../slices/invoiceFormSlice';
import { CACHE_PREFIXES } from '@/config/cacheConfig';
import { queryClient } from '@/lib/queryClient';
import { clearItemRatesCache } from '@/features/item-pricing/useItemRates';
import { clearStandardRateCache } from '@/features/item-pricing/useStandardRate';
import { clearAutocompleteCache } from '@/services/autocomplete-service';
import { sweepSharedDocuments } from '@/utils/shareDocument';
import { clearSessionScopedState } from '../sessionScopedState';
import { recentSearches, rememberSearch } from '@/features/filters/recentSearches';
import { Image } from 'expo-image';
import { getSessionIdentity } from '@/config/supabaseConfig';
import { readReportCache, writeReportCache } from '@/features/reports/reportCache';
import {
  holdLocalPhoto,
  localPhotoFilesIdle,
  localPhotoUploadEnded,
  registerLocalPhoto,
  releaseLocalPhotos,
  releaseLocalPhotosOwnedBy,
} from '@/utils/localPhotoFiles';

jest.mock('@/lib/queryClient', () => ({
  queryClient: { cancelQueries: jest.fn(async () => {}), clear: jest.fn() },
}));
jest.mock('@/features/item-pricing/useItemRates', () => ({ clearItemRatesCache: jest.fn() }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ clearStandardRateCache: jest.fn() }));
jest.mock('@/services/autocomplete-service', () => ({ clearAutocompleteCache: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ sweepSharedDocuments: jest.fn(async () => {}) }));
jest.mock('@/config/supabaseConfig', () => ({ getSessionIdentity: jest.fn() }));
// The real photo file registry, with its owner release watched for the order of the teardown.
jest.mock('@/utils/localPhotoFiles', () => {
  const actual = jest.requireActual('@/utils/localPhotoFiles');
  return { ...actual, releaseLocalPhotosOwnedBy: jest.fn(actual.releaseLocalPhotosOwnedBy) };
});
const mockFiles = new Set<string>();
jest.mock('expo-file-system', () => ({
  Paths: {
    cache: { uri: 'file:///data/user/0/org.example.warehouse/cache/' },
    document: { uri: 'file:///data/user/0/org.example.warehouse/files/' },
  },
  File: class {
    uri: string;
    constructor(path: string) {
      this.uri = path;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));
jest.mock('expo-image', () => ({
  Image: { clearDiskCache: jest.fn(async () => true), clearMemoryCache: jest.fn(async () => true) },
}));

const makeStore = () =>
  configureStore({
    reducer: { grnForm: grnReducer, dispatchForm: dispatchReducer, invoiceForm: invoiceReducer },
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
  expect([...remaining].sort()).toEqual(['operator_server_v1', 'persist:root']);
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
  expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual(['app_language', 'operator_server_v1']);
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

// The last answer of each report is kept on the phone: customer names and documents of the facility just left.
it('removes the reports kept on the phone, with their index', async () => {
  jest.mocked(getSessionIdentity).mockResolvedValue({ origin: 'https://warehouse.example.test', instanceId: 'instance-a', subject: 'user-a' });
  const key = ['dispatch-activity', 'customer', 'customer-1', '2026-01-01', '2026-10-10'];
  await writeReportCache(key, { data: { dispatches: [{ disp_no: 'DD0003', customer_name: 'Fictional Traders' }] }, updatedAt: Date.now() });
  await AsyncStorage.setItem('operator_server_v1', '{"origin":"https://warehouse.example.test"}');
  expect(await readReportCache(key)).not.toBeNull();
  expect((await AsyncStorage.getAllKeys()).filter(stored => stored.startsWith(CACHE_PREFIXES.REPORT))).toHaveLength(2);

  await clearSessionScopedState(makeStore().dispatch);

  expect(await AsyncStorage.getAllKeys()).toEqual(['operator_server_v1']);
  expect(await readReportCache(key)).toBeNull();
  jest.mocked(getSessionIdentity).mockReset();
});

// Photos are cached by address, not by account: a photo seen under one account
// would otherwise stay on the phone after sign-out, for the next account.
describe('the image cache', () => {
  it('is emptied, on disk and in memory, when a session ends', async () => {
    await clearSessionScopedState(makeStore().dispatch);
    expect(Image.clearDiskCache).toHaveBeenCalledTimes(1);
    expect(Image.clearMemoryCache).toHaveBeenCalledTimes(1);
  });

  it('does not stop the teardown when it cannot be emptied', async () => {
    jest.mocked(Image.clearDiskCache).mockRejectedValueOnce(new Error('fictional cache failure'));
    await AsyncStorage.setItem(`${CACHE_PREFIXES.DISPATCH_LIST}_x`, '{}');
    await expect(clearSessionScopedState(makeStore().dispatch)).resolves.toBeUndefined();
    expect(Image.clearMemoryCache).toHaveBeenCalledTimes(1);
    expect(sweepSharedDocuments).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});

// The report screens remember the customer last opened; that names a customer of the facility just left.
it('forgets the customer last opened in a report, for every account, and keeps the other report choices', async () => {
  const { default: reportPrefsReducer, setReportCustomer, setReportPeriod, toggleReportPin } =
    jest.requireActual<typeof import('../slices/reportPrefsSlice')>('../slices/reportPrefsSlice');
  const store = configureStore({ reducer: { reportPrefs: reportPrefsReducer } });
  for (const scope of ['scope-a', 'scope-b']) {
    store.dispatch(setReportCustomer({ scope, reportId: 'grn-activity', customer: { id: 'c1', name: 'Fictional Traders' } }));
  }
  store.dispatch(setReportPeriod({ scope: 'scope-a', period: { preset: 'last240' } }));
  store.dispatch(toggleReportPin({ scope: 'scope-a', reportId: 'stock-summary' }));

  await clearSessionScopedState(store.dispatch);

  const { byScope } = store.getState().reportPrefs;
  expect(byScope['scope-a'].lastCustomer).toEqual({});
  expect(byScope['scope-b'].lastCustomer).toEqual({});
  expect(byScope['scope-a'].period).toEqual({ preset: 'last240' });
  expect(byScope['scope-a'].pinned).toEqual(['stock-summary']);
});

// P2F-MEDIA-3: the photo files the app wrote for the forms and the camera in this session go with it.
it('releases the photo files of the GRN form, the dispatch form and the camera, after the image cache', async () => {
  await clearSessionScopedState(makeStore().dispatch);
  expect(releaseLocalPhotosOwnedBy).toHaveBeenCalledTimes(3);
  expect(jest.mocked(releaseLocalPhotosOwnedBy).mock.calls.map(([owner]) => owner).sort()).toEqual(['camera', 'dispatch-form', 'grn-form']);
  const firstRelease = Math.min(...jest.mocked(releaseLocalPhotosOwnedBy).mock.invocationCallOrder);
  expect(jest.mocked(Image.clearMemoryCache).mock.invocationCallOrder[0]).toBeLessThan(firstRelease);
  expect(firstRelease).toBeLessThan(jest.mocked(sweepSharedDocuments).mock.invocationCallOrder[0]);
});

it('deletes on sign-out the photo files kept for a retry, and keeps one an upload still runs on until it ends', async () => {
  const folder = 'file:///data/user/0/org.example.warehouse/cache/ImageManipulator';
  const grnCopy = `${folder}/session-grn-copy.webp`;
  const dispatchCopy = `${folder}/session-dispatch-copy.webp`;
  const running = `${folder}/session-running-copy.webp`;
  for (const [uri, owner] of [[grnCopy, 'grn-form'], [dispatchCopy, 'dispatch-form'], [running, 'grn-form']]) {
    mockFiles.add(uri);
    await registerLocalPhoto(uri, owner, 'prepared');
  }
  // Two uploads failed and wait for a retry; the saved forms were reset meanwhile.
  for (const uri of [grnCopy, dispatchCopy]) {
    const end = holdLocalPhoto(uri);
    localPhotoUploadEnded(uri, false);
    end();
  }
  await releaseLocalPhotos([grnCopy, dispatchCopy]);
  expect(mockFiles.has(grnCopy)).toBe(true);
  const endRunning = holdLocalPhoto(running);

  await clearSessionScopedState(makeStore().dispatch);
  await localPhotoFilesIdle();
  expect(mockFiles.has(grnCopy)).toBe(false);
  expect(mockFiles.has(dispatchCopy)).toBe(false);
  expect(mockFiles.has(running)).toBe(true);

  // The running upload fails after the sign-out: nothing waits for it any more.
  localPhotoUploadEnded(running, false);
  endRunning();
  await localPhotoFilesIdle();
  expect(mockFiles.has(running)).toBe(false);
});

it('forgets the rates cached for Item pricing', async () => {
  await clearSessionScopedState(makeStore().dispatch);
  expect(clearItemRatesCache).toHaveBeenCalledTimes(1);
  expect(clearStandardRateCache).toHaveBeenCalledTimes(1);
});
