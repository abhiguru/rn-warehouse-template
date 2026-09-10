import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getAuthToken } from '../authTokenUtils';

jest.mock('@/config/supabaseConfig', () => ({ getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) }));

it('decodes legacy base64 tokens before migrating to secure storage', async () => {
  await AsyncStorage.clear();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  await AsyncStorage.multiSet([
    ['auth_token', btoa('test.access.jwt')],
    ['refresh_token', btoa('test.refresh.jwt')],
    ['token_expires_at', String(Date.now() + 60000)],
  ]);
  const result = await getAuthToken();
  expect(result.token).toBe('test.access.jwt');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('secure_auth_token', 'test.access.jwt');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('secure_refresh_token', 'test.refresh.jwt');
});
