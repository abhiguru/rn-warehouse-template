import { useColorScheme } from 'react-native';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  ThemePreference,
  setThemePreference,
  selectThemePreference,
  selectResolvedThemeMode,
} from '@/store/slices/themeSlice';
import { getTheme, getThemeColors, ThemeMode } from '@/theme';

/**
 * Hook for accessing and managing theme state
 *
 * @returns Theme utilities and state
 */
export function useTheme() {
  const dispatch = useAppDispatch();
  const preference = useAppSelector(selectThemePreference);
  const systemColorScheme = useColorScheme();

  // Resolve the actual theme mode based on preference and system setting
  const resolvedMode: ThemeMode = selectResolvedThemeMode(preference, systemColorScheme);

  // Get theme colors for the resolved mode
  const colors = getThemeColors(resolvedMode);

  // Get the full theme object for the resolved mode
  const theme = getTheme(resolvedMode);

  // Check if dark mode is active
  const isDarkMode = resolvedMode === 'dark';

  // Set theme preference
  const setPreference = (newPreference: ThemePreference) => {
    dispatch(setThemePreference(newPreference));
  };

  return {
    // Current state
    preference,
    resolvedMode,
    isDarkMode,
    systemColorScheme,

    // Theme data
    colors,
    theme,

    // Actions
    setPreference,
    setLight: () => setPreference('light'),
    setDark: () => setPreference('dark'),
    setSystem: () => setPreference('system'),
  };
}

export default useTheme;
