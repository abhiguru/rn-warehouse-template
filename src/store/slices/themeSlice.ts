import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ThemeMode } from '@/theme';
import type { Brand } from '@/theme/tokens';

export type ThemePreference = 'light' | 'dark' | 'system';
export type { Brand };

interface ThemeState {
  preference: ThemePreference;
  /** Colour brand chosen in Settings (docs/STYLE_GUIDE.md). Older persisted state has none. */
  brand?: Brand;
}

/** Brand used until the user picks one; a build may set EXPO_PUBLIC_DEFAULT_BRAND. */
export const DEFAULT_BRAND: Brand =
  process.env.EXPO_PUBLIC_DEFAULT_BRAND === 'gcsa' ? 'gcsa' : 'orange';

const initialState: ThemeState = {
  preference: 'system', // Default to system preference
  brand: DEFAULT_BRAND,
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setThemePreference: (state, action: PayloadAction<ThemePreference>) => {
      state.preference = action.payload;
    },
    setBrand: (state, action: PayloadAction<Brand>) => {
      state.brand = action.payload === 'gcsa' ? 'gcsa' : 'orange';
    },
  },
});

export const { setThemePreference, setBrand } = themeSlice.actions;

/** Selected brand; persisted state from before brands existed falls back to the default. */
export const selectBrand = (state: { theme: ThemeState }): Brand =>
  state.theme.brand === 'gcsa' || state.theme.brand === 'orange' ? state.theme.brand : DEFAULT_BRAND;

/**
 * Selector to get the theme preference
 */
export const selectThemePreference = (state: { theme: ThemeState }): ThemePreference =>
  state.theme.preference;

/**
 * Selector to resolve the actual theme mode based on preference and system setting
 * @param systemColorScheme - The system color scheme from useColorScheme()
 */
export const selectResolvedThemeMode = (
  preference: ThemePreference,
  systemColorScheme: 'light' | 'dark' | null | undefined
): ThemeMode => {
  if (preference === 'system') {
    return systemColorScheme === 'dark' ? 'dark' : 'light';
  }
  return preference;
};

export default themeSlice.reducer;
