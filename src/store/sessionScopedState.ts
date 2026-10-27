/**
 * Session-scoped state teardown shared by logout, forced logout, account
 * deletion and both server-switch paths. Everything cleared here belongs to one
 * signed-in session on one server and must not survive into the next one.
 */
import type { UnknownAction } from '@reduxjs/toolkit';
import { queryClient } from '@/lib/queryClient';
import { clearAutocompleteCache } from '@/services/autocomplete-service';
import { clearRateStartFloor } from '@/services/rateStartFloor';
import { resetForm as resetGrn } from './slices/grnFormSlice';
import { resetForm as resetDispatch } from './slices/dispatchFormSlice';
import { resetForm as resetInvoice } from './slices/invoiceFormSlice';
import { resetAllListFilters } from './slices/listFilterSlice';
import { forgetReportCustomers } from './slices/reportPrefsSlice';
import { clearAllCaches } from '@/utils/cacheManager';
import { sweepSharedDocuments } from '@/utils/shareDocument';
import { clearImageCaches } from '@/utils/imageCache';
import { LOCAL_PHOTO_OWNERS, releaseLocalPhotosOwnedBy } from '@/utils/localPhotoFiles';
import { forgetRecentSearches } from '@/features/filters/recentSearches';
import { clearItemRatesCache } from '@/features/item-pricing/useItemRates';
import { dropAlertsWithHandlers } from '@/utils/alert';
import { clearStandardRateCache } from '@/features/item-pricing/useStandardRate';
import { registerSessionScoped, runSessionScopedClears } from '@/config/sessionScopedRegistry';

// The teardown's order is the registration order below. Modules that keep a cache of their own and
// can import the registry without a cycle register themselves (registerSessionScoped); the
// ones listed here are registered by this file because they are store slices or sit above it.
// A waiting dialog with a handler would act for the session that just ended; plain messages stay.
registerSessionScoped('alerts-with-handlers', () => dropAlertsWithHandlers());
registerSessionScoped('query-client', async () => {
  await queryClient.cancelQueries();
  queryClient.clear();
});
registerSessionScoped('autocomplete', () => clearAutocompleteCache());
registerSessionScoped('forms', ({ dispatch }) => {
  dispatch(resetGrn());
  dispatch(resetDispatch());
  dispatch(resetInvoice());
});
// Filters and searches name customers and items of this session's facility.
registerSessionScoped('list-filters', ({ dispatch }) => {
  dispatch(resetAllListFilters());
});
// The customer last opened in a report is kept on the phone; the period, sorts and pinned reports name no facility data and stay.
registerSessionScoped('report-customers', ({ dispatch }) => {
  dispatch(forgetReportCustomers());
});
// So do the "Recent" searches offered under a search field; they are kept outside the store.
registerSessionScoped('recent-searches', () => forgetRecentSearches());
// The rates cached for Item pricing belong to this session's facility and person.
registerSessionScoped('item-rates', () => clearItemRatesCache());
registerSessionScoped('standard-rate', () => clearStandardRateCache());
registerSessionScoped('rate-start-floor', () => clearRateStartFloor());
registerSessionScoped('cache-manager', () => clearAllCaches());
// Photos seen in this session must not stay on the phone for the next one.
registerSessionScoped('image-caches', () => clearImageCaches());
// So must the photo files the app wrote for its forms and camera, also those
// kept for a retry (the retry is given up); a file an upload still runs on is
// kept by the registry until that upload ends. Never throws.
registerSessionScoped('local-photo-files', async () => {
  await Promise.all(
    [LOCAL_PHOTO_OWNERS.grnForm, LOCAL_PHOTO_OWNERS.dispatchForm, LOCAL_PHOTO_OWNERS.camera].map(owner =>
      releaseLocalPhotosOwnedBy(owner, { abandonRetries: true })
    )
  );
});
// Local teardown must not fail because a cached file could not be removed.
registerSessionScoped('shared-documents', async () => {
  await sweepSharedDocuments().catch(() => {});
});

export async function clearSessionScopedState(
  dispatch: (action: UnknownAction) => unknown
): Promise<void> {
  await runSessionScopedClears({ dispatch });
}
