import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ThemeMode } from '@/theme';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeState {
  preference: ThemePreference;
}

const initialState: ThemeState = {
  preference: 'system', // Default to system preference
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setThemePreference: (state, action: PayloadAction<ThemePreference>) => {
      state.preference = action.payload;
    },
  },
});

export const { setThemePreference } = themeSlice.actions;

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
