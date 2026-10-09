import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  ThemePreference,
  setThemePreference,
  selectThemePreference,
  selectResolvedThemeMode,
  selectBrand,
  setBrand as setBrandAction,
  type Brand,
} from '@/store/slices/themeSlice';
import { getTheme, getThemeColors, ThemeMode } from '@/theme';
import { getTokens, type ThemeTokens } from '@/theme/tokens';

/**
 * Hook for accessing and managing theme state
 *
 * @returns Theme utilities and state
 */
export function useTheme() {
  const dispatch = useAppDispatch();
  const preference = useAppSelector(selectThemePreference);
  const brand = useAppSelector(selectBrand);
  const systemColorScheme = useColorScheme();

  // Resolve the actual theme mode based on preference and system setting
  const resolvedMode: ThemeMode = selectResolvedThemeMode(preference, systemColorScheme);

  // Semantic tokens for the chosen brand and mode (preferred by new code)
  const tokens = getTokens(brand, resolvedMode);

  // Legacy palette for the resolved mode and brand
  const colors = getThemeColors(resolvedMode, brand);

  // Get the full theme object for the resolved mode
  const theme = getTheme(resolvedMode, brand);

  // Check if dark mode is active
  const isDarkMode = resolvedMode === 'dark';

  // Set theme preference
  const setPreference = (newPreference: ThemePreference) => {
    dispatch(setThemePreference(newPreference));
  };

  return {
    // Current state
    preference,
    brand,
    resolvedMode,
    tokens,
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
    setBrand: (next: Brand) => dispatch(setBrandAction(next)),
  };
}

/** The semantic tokens for the current brand and mode. */
export function useTokens(): ThemeTokens {
  return useTheme().tokens;
}

/**
 * Builds a StyleSheet from the current tokens and rebuilds it only when the brand
 * or mode changes. This is the pattern for every themed component:
 *
 *   const styles = useThemedStyles(t => ({ card: { backgroundColor: t.surface.card } }));
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (tokens: ThemeTokens) => T
): T {
  const tokens = useTokens();
  // The factory is expected to be stable (module-level or memoised by the caller).
  return useMemo(() => StyleSheet.create(factory(tokens)), [tokens]);
}

export default useTheme;
