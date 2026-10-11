/**
 * Session-scoped state teardown shared by logout, forced logout, account
 * deletion and both server-switch paths. Everything cleared here belongs to one
 * signed-in session on one server and must not survive into the next one.
 */
import type { UnknownAction } from '@reduxjs/toolkit';
import { queryClient } from '@/lib/queryClient';
import { clearAutocompleteCache } from '@/services/autocomplete-service';
import { resetForm as resetGrn } from './slices/grnFormSlice';
import { resetForm as resetDispatch } from './slices/dispatchFormSlice';
import { resetForm as resetInvoice } from './slices/invoiceFormSlice';
import { resetForm as resetCustomer } from './slices/customerFormSlice';
import { resetAllListFilters } from './slices/listFilterSlice';
import { clearAllCaches } from '@/utils/cacheManager';
import { sweepSharedDocuments } from '@/utils/shareDocument';
import { clearImageCaches } from '@/utils/imageCache';
import { forgetRecentSearches } from '@/features/filters/recentSearches';

export async function clearSessionScopedState(
  dispatch: (action: UnknownAction) => unknown
): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.clear();
  clearAutocompleteCache();
  dispatch(resetGrn());
  dispatch(resetDispatch());
  dispatch(resetInvoice());
  dispatch(resetCustomer());
  // Filters and searches name customers and items of this session's facility.
  dispatch(resetAllListFilters());
  // So do the "Recent" searches offered under a search field; they are kept outside the store.
  forgetRecentSearches();
  await clearAllCaches();
  // Photos seen in this session must not stay on the phone for the next one.
  await clearImageCaches();
  // Local teardown must not fail because a cached file could not be removed.
  await sweepSharedDocuments().catch(() => {});
}
