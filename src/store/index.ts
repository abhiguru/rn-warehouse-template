import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { combineReducers } from 'redux';
import { restorePreferences } from './persistence';

// Import slices
import authReducer from './slices/authSlice';
import configReducer from './slices/configSlice';
import grnFormReducer from './slices/grnFormSlice';
import dispatchFormReducer from './slices/dispatchFormSlice';
import invoiceFormReducer from './slices/invoiceFormSlice';
import listFilterReducer from './slices/listFilterSlice';
import reportPrefsReducer from './slices/reportPrefsSlice';
import themeReducer from './slices/themeSlice';

// Import middleware
import { validationMiddleware } from './middleware/validationMiddleware';

const rootReducer = combineReducers({
  auth: authReducer,
  config: configReducer,
  grnForm: grnFormReducer,
  dispatchForm: dispatchFormReducer,
  invoiceForm: invoiceFormReducer,
  // Session only: not in the persist whitelist below.
  listFilters: listFilterReducer,
  // Persisted: what was last chosen on the report screens, per facility and account.
  reportPrefs: reportPrefsReducer,
  theme: themeReducer,
});

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  // #22 Fix: Minimize persisted data to reduce cold start delay
  // - Form slices: Reset on app restart (user expectation)
  // - config: Fetched fresh after auth initialization
  // Auth is restored only from the complete SecureStore session.
  // - reportPrefs: choices on the report screens; its one piece of facility data
  //   (the last customer) is cleared with the session (sessionScopedState.ts).
  whitelist: ['theme', 'reportPrefs'],
  migrate: restorePreferences,
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

const LARGE_INVOICE_PATHS = ['invoiceForm.items', 'invoiceForm.baseline.items'];

export const store = configureStore({
  reducer: persistedReducer,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      // The line list of a big GRN (thousands of objects, and the edit baseline's copy) made every
      // keystroke walk all of them in these two dev-only checks. Everything else is still checked.
      immutableCheck: {
        ignoredPaths: LARGE_INVOICE_PATHS,
      },
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        // 'meta.arg' and 'meta.baseQueryMeta' keep the library defaults. 'payload.items' also skips the
        // lines in the payload of invoiceForm/loadInvoiceEditData, grnForm/loadGRNData,
        // dispatchForm/loadDispatchData and dispatchForm/loadFromOrder (without it the check walked every
        // line). Acceptable: those reducers copy the items into state, where the GRN and dispatch paths are
        // still checked, and the invoice paths are the ignored LARGE_INVOICE_PATHS (whose size is the reason).
        ignoredActionPaths: ['meta.arg', 'meta.baseQueryMeta', 'payload.items'],
        ignoredPaths: LARGE_INVOICE_PATHS,
      },
    }).concat(validationMiddleware),
});

export const persistor = persistStore(store);

// Define RootState from rootReducer to avoid circular reference with middleware
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
