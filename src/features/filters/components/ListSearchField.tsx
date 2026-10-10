/**
 * Search field at the top of a list (docs/STYLE_GUIDE.md §13.8, §14.6).
 *
 * Searches as the user types: after 300 ms and at least two characters.
 * Shows a spinner while the list loads, a clear button, and the last searches
 * of this session when the field is focused and empty.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MIN_LENGTH = 2;
const RECENT_LIMIT = 5;

/** Recent searches per list. Module state: gone when the app closes. */
const recentByList = new Map<string, string[]>();
export function rememberSearch(listKey: string, text: string) {
  const trimmed = text.trim();
  if (trimmed.length < SEARCH_MIN_LENGTH) return;
  const others = (recentByList.get(listKey) ?? []).filter(entry => entry.toLowerCase() !== trimmed.toLowerCase());
  recentByList.set(listKey, [trimmed, ...others].slice(0, RECENT_LIMIT));
}
export const recentSearches = (listKey: string) => recentByList.get(listKey) ?? [];
export const forgetRecentSearches = () => recentByList.clear();

export interface ListSearchFieldProps {
  listKey: string;
  /** The search in effect. */
  value: string;
  onSearch: (text: string) => void;
  placeholder: string;
  /** The list is loading results for the current search. */
  loading?: boolean;
}

const makeStyles = (t: ThemeTokens) => ({
  wrap: {
    paddingHorizontal: layout.marginCompact,
    paddingBottom: space.sm,
    backgroundColor: t.surface.header,
  },
  field: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 44,
    paddingLeft: space.md,
    borderRadius: radius.button,
    backgroundColor: t.background.base,
  },
  input: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
  },
  trailing: {
    width: touchTarget,
    minHeight: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  recentRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingTop: space.sm,
  },
  recentLabel: { ...typography.footnote, color: t.text.secondary },
  recentChip: {
    minHeight: 32,
    justifyContent: 'center' as const,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: t.surface.card,
  },
  recentChipPressed: { backgroundColor: t.surface.cardPressed },
  recentText: { ...typography.footnote, fontWeight: fontWeight.medium, color: t.text.primary },
});

export function ListSearchField({ listKey, value, onSearch, placeholder, loading = false }: ListSearchFieldProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const committed = useRef(value);

  // The search changed from outside (Clear all, a recent search): show it.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);

  const commit = (next: string) => {
    const trimmed = next.trim();
    const effective = trimmed.length >= SEARCH_MIN_LENGTH ? trimmed : '';
    if (effective === committed.current) return;
    committed.current = effective;
    onSearch(effective);
  };

  useEffect(() => {
    const timer = setTimeout(() => commit(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `commit` reads refs and the latest onSearch only when the timer fires.
     
  }, [text]);

  const recent = focused && text.trim() === '' ? recentSearches(listKey) : [];

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} />
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={t.text.placeholder}
          accessibilityLabel={placeholder}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            rememberSearch(listKey, committed.current);
          }}
          onSubmitEditing={() => {
            commit(text);
            rememberSearch(listKey, text);
          }}
        />
        {loading && text.trim().length >= SEARCH_MIN_LENGTH ? (
          <View style={styles.trailing} accessibilityLabel="Searching" accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={t.brand.tint} />
          </View>
        ) : text.length > 0 ? (
          <Pressable
            style={styles.trailing}
            onPress={() => {
              setText('');
              commit('');
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
        ) : null}
      </View>
      {recent.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.recentRow}>
            <Text style={styles.recentLabel}>Recent</Text>
            {recent.map(entry => (
              <Pressable
                key={entry}
                style={({ pressed }) => [styles.recentChip, pressed && styles.recentChipPressed]}
                onPress={() => {
                  setText(entry);
                  commit(entry);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Search again for ${entry}`}
              >
                <Text style={styles.recentText} numberOfLines={1} maxFontSizeMultiplier={1.6}>{entry}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

export default ListSearchField;
