import { configureStore } from '@reduxjs/toolkit';
import { persistReducer, persistStore } from 'redux-persist';
import { restorePreferences } from '../persistence';

test('legacy persisted identity cannot bypass SecureStore during a real rehydration', async () => {
  const storage = {
    getItem: async () =>
      JSON.stringify({
        auth: JSON.stringify({
          user: { id: 'obsolete-account' },
          session: { access_token: 'obsolete-token' },
        }),
        config: JSON.stringify({ fullConfig: { private: 'obsolete' } }),
        theme: JSON.stringify({ dark: true }),
        _persist: JSON.stringify({ version: -1, rehydrated: true }),
      }),
    setItem: async () => {},
    removeItem: async () => {},
  };
  const initial = {
    auth: { user: null, session: null },
    config: { fullConfig: null },
    theme: { dark: false },
  };
  const store = configureStore({
    reducer: persistReducer(
      {
        key: 'root',
        storage,
        timeout: 0,
        whitelist: ['theme', 'filter'],
        migrate: restorePreferences,
      },
      (state = initial) => state
    ),
    middleware: defaults => defaults({ serializableCheck: false }),
  });
  let persistor: ReturnType<typeof persistStore>;
  await new Promise<void>(resolve => {
    persistor = persistStore(store, undefined, resolve);
  });
  expect(store.getState().auth).toEqual(initial.auth);
  expect(store.getState().config).toEqual(initial.config);
  expect(store.getState().theme).toEqual({ dark: true });
  await persistor!.flush();
  persistor!.pause();
});
