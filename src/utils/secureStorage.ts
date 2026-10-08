/** Compatibility exports. All session persistence uses one fail-closed manager. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  cacheUserProfile,
  clearStoredTokens,
  getCachedUserProfile,
  getStoredToken,
  storeTokens,
} from '@/config/supabaseConfig';

export { cacheUserProfile, getCachedUserProfile };
export const storeTokensSecurely = storeTokens;
export const clearStoredTokensSecurely = clearStoredTokens;

export const getStoredTokensSecurely = async () => {
  const stored = await getStoredToken();
  return {
    authToken: stored.authToken ?? null,
    refreshToken: stored.refreshToken ?? null,
    expiresAt: stored.expiresAt ?? 0,
    isValid: stored.isValid,
    type: stored.type ?? null,
  };
};

export const migrateTokensToSecureStorage = async (): Promise<boolean> => {
  // The manager returns legacy tokens only after secure persistence succeeds.
  // An expired access token may still have a usable refresh credential.
  return Boolean((await getStoredToken()).refreshToken);
};

export const clearUserProfileCache = async (): Promise<void> => {
  await SecureStore.deleteItemAsync('cached_user_profile');
  await AsyncStorage.removeItem('cached_user_profile');
};

export const clearAllStoredData = clearStoredTokens;
