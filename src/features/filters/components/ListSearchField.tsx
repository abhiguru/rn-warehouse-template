/**
 * Search field at the top of a list (docs/STYLE_GUIDE.md §13.8, §14.6).
 *
 * Searches as the user types: after 300 ms and at least two characters.
 * Shows a spinner while the list loads, a clear button (which also closes the
 * keyboard), and the last searches of this session when the field is focused and empty.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

import { SEARCH_MIN_LENGTH, recentSearches, rememberSearch } from '../recentSearches';
import { hasTooManyWords } from '../searchMatch';

export const SEARCH_DEBOUNCE_MS = 300;
/** The server reads at most this much of a search (search_terms, backend migrations 35 and 36). */
export const SEARCH_MAX_LENGTH = 120;
export { SEARCH_MIN_LENGTH, forgetRecentSearches, recentSearches, rememberSearch } from '../recentSearches';

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
  // No top padding: the space above each 32 high pill inside its touch target sets it off the field.
  recentRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  recentTarget: { minHeight: touchTarget, justifyContent: 'center' as const },
  recentLabel: { ...typography.footnote, color: t.text.secondary },
  hint: { ...typography.footnote, color: t.text.secondary, paddingTop: space.xs },
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
  // One letter is shown in the field but not searched for; say so, or the field and the list disagree.
  const tooShort = text.trim().length > 0 && text.trim().length < SEARCH_MIN_LENGTH;

  // The server searches for the first eight words only; say so, or the ninth looks searched for.
  const tooManyWords = hasTooManyWords(text);

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
          // Names and numbers are typed here; a number range is put in capitals when it is read.
          autoCapitalize="none"
          maxLength={SEARCH_MAX_LENGTH}
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
          <View style={styles.trailing} accessibilityLabel={translate('filters.search.searching')} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={t.brand.tint} />
          </View>
        ) : text.length > 0 ? (
          <Pressable
            style={styles.trailing}
            onPress={() => {
              setText('');
              commit('');
              // Cleared means done with the field: put the keyboard away (the list is behind it).
              Keyboard.dismiss();
            }}
            accessibilityRole="button"
            accessibilityLabel={translate('common.clearSearch')}
          >
            <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
        ) : null}
      </View>
      {tooShort ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">{translate('filters.search.minLength')}</Text>
      ) : null}
      {tooManyWords ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">{translate('filters.search.tooManyWords')}</Text>
      ) : null}
      {recent.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.recentRow}>
            <Text style={styles.recentLabel}>{translate('filters.search.recent')}</Text>
            {recent.map(entry => (
              <Pressable
                key={entry}
                // The whole touch target is pressable; the pill is drawn inside it (§11.2).
                style={styles.recentTarget}
                onPress={() => {
                  setText(entry);
                  commit(entry);
                }}
                accessibilityRole="button"
                accessibilityLabel={translate('filters.search.searchAgain', { text: entry })}
              >
                {({ pressed }) => (
                  <View style={[styles.recentChip, pressed && styles.recentChipPressed]}>
                    <Text style={styles.recentText} numberOfLines={1} maxFontSizeMultiplier={1.6}>{entry}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

export default ListSearchField;
