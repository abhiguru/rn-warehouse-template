import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { combineReducers } from 'redux';

// Import slices
import authReducer from './slices/authSlice';
import configReducer from './slices/configSlice';
import grnFormReducer from './slices/grnFormSlice';
import dispatchFormReducer from './slices/dispatchFormSlice';
import invoiceFormReducer from './slices/invoiceFormSlice';
import customerFormReducer from './slices/customerFormSlice';
import filterReducer from './slices/filterSlice';
import themeReducer from './slices/themeSlice';

// Import middleware
import { validationMiddleware } from './middleware/validationMiddleware';

const rootReducer = combineReducers({
  auth: authReducer,
  config: configReducer,
  grnForm: grnFormReducer,
  dispatchForm: dispatchFormReducer,
  invoiceForm: invoiceFormReducer,
  customerForm: customerFormReducer,
  filter: filterReducer,
  theme: themeReducer,
});

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  // #22 Fix: Minimize persisted data to reduce cold start delay
  // - Form slices: Reset on app restart (user expectation)
  // - config: Fetched fresh after auth initialization
  // Note: auth IS persisted to maintain login state across reloads
  blacklist: ['grnForm', 'dispatchForm', 'invoiceForm', 'customerForm', 'config'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }).concat(validationMiddleware),
});

export const persistor = persistStore(store);

// Define RootState from rootReducer to avoid circular reference with middleware
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;