/**
 * Pick several options from a long list (customers, items).
 *
 * The chosen options stay in a "Selected" group at the top, so they can be
 * unticked without scrolling. A first page of options shows before anything is
 * typed; the server is searched after two characters and 300 ms
 * (docs/STYLE_GUIDE.md §14.6).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { normalizeDigits, t as translate } from '@/i18n';
import { fontWeight, iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { FilterContext, PickedOption, PickerField } from '../../types';
import { HighlightedText, searchWords } from '../HighlightedText';

const SEARCH_DELAY_MS = 300;
const SEARCH_MIN_LENGTH = 2;

/** The things a picker can list. Each has its own whole sentences (`filters.picker.<noun>`). */
const PICKER_NOUNS = ['customer', 'item'] as const;
type PickerNoun = (typeof PICKER_NOUNS)[number];
type PickerText = 'search' | 'loadFailed' | 'noMatch' | 'typeToSearch' | 'done';

/**
 * A sentence of the picker for what it lists: "Search customers", "No items match …".
 * A noun without texts of its own (none in the app today) is worded in English, as before.
 */
export function pickerText(noun: [string, string], text: PickerText, search = ''): string {
  const [singular, plural] = noun;
  if ((PICKER_NOUNS as readonly string[]).includes(singular)) {
    return translate(`filters.picker.${singular as PickerNoun}.${text}`, { search });
  }
  switch (text) {
    case 'search':
      return `Search ${plural}`;
    case 'loadFailed':
      return `Couldn't load ${plural}. Check your connection and try again.`;
    case 'noMatch':
      return `No ${plural} match "${search}".`;
    case 'typeToSearch':
      return `Type at least two letters to search ${plural}.`;
    case 'done':
      return `Done choosing ${plural}`;
  }
}

export interface OptionPickerProps {
  field: PickerField;
  value: PickedOption[];
  onChange: (value: PickedOption[]) => void;
  ctx: FilterContext;
}

type Row = { type: 'heading'; title: string } | { type: 'option'; option: PickedOption; selected: boolean };

const makeStyles = (t: ThemeTokens) => ({
  wrap: { flex: 1 },
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 44,
    paddingLeft: space.md,
    borderRadius: radius.button,
    backgroundColor: t.background.base,
  },
  input: { ...typography.body, flex: 1, color: t.text.primary, paddingVertical: space.sm, paddingHorizontal: space.sm },
  trailing: { width: touchTarget, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  list: { flex: 1, marginTop: space.sm },
  heading: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.text.secondary, paddingVertical: space.sm },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  rowPressed: { backgroundColor: t.surface.cardPressed },
  rowText: { flex: 1 },
  name: { ...typography.body, color: t.text.primary },
  detail: { ...typography.footnote, color: t.text.secondary },
  message: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const, paddingVertical: space.xl },
});

export function OptionPicker({ field, value, onChange, ctx }: OptionPickerProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<PickedOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    // ૦-૯ and 0-9 mean the same to the search (docs/I18N.md rule 6).
    const trimmed = normalizeDigits(query).trim();
    const searching = trimmed.length >= SEARCH_MIN_LENGTH;
    const request = ++latest.current;
    setLoading(true);
    const timer = setTimeout(
      () => {
        (searching ? field.source.search(trimmed, ctx) : field.source.initial(ctx))
          .then(found => {
            if (request !== latest.current) return;
            setOptions(found);
            setFailed(false);
          })
          .catch(() => {
            if (request !== latest.current) return;
            setOptions([]);
            setFailed(true);
          })
          .finally(() => {
            if (request === latest.current) setLoading(false);
          });
      },
      searching ? SEARCH_DELAY_MS : 0
    );
    return () => clearTimeout(timer);
  }, [query, field, ctx]);

  const selectedIds = useMemo(() => new Set(value.map(option => option.id)), [value]);
  const rows = useMemo(() => {
    const result: Row[] = [];
    if (value.length > 0) {
      result.push({ type: 'heading', title: translate('filters.picker.selected', { count: value.length }) });
      value.forEach(option => result.push({ type: 'option', option, selected: true }));
    }
    const rest = options.filter(option => !selectedIds.has(option.id));
    if (rest.length > 0) {
      if (value.length > 0) result.push({ type: 'heading', title: query.trim().length >= SEARCH_MIN_LENGTH ? translate('filters.picker.matches') : translate('common.all') });
      rest.forEach(option => result.push({ type: 'option', option, selected: false }));
    }
    return result;
  }, [value, options, selectedIds, query]);

  const toggle = (option: PickedOption) =>
    onChange(selectedIds.has(option.id) ? value.filter(entry => entry.id !== option.id) : [...value, option]);
  const words = searchWords(query);
  const placeholder = pickerText(field.noun, 'search');

  return (
    <View style={styles.wrap}>
      <View style={styles.search}>
        <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={t.text.placeholder}
          accessibilityLabel={placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {loading ? (
          <View style={styles.trailing}>
            <ActivityIndicator size="small" color={t.brand.tint} />
          </View>
        ) : query.length > 0 ? (
          <Pressable style={styles.trailing} onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={translate('common.clearSearch')}>
            <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
        ) : null}
      </View>
      <FlatList
        style={styles.list}
        data={rows}
        keyExtractor={(row, index) => (row.type === 'heading' ? `heading-${index}` : `${row.selected ? 's' : 'o'}-${row.option.id}`)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: row }) =>
          row.type === 'heading' ? (
            <Text style={styles.heading} accessibilityRole="header">{row.title}</Text>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => toggle(row.option)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: row.selected }}
              accessibilityLabel={row.option.detail ? `${row.option.label}, ${row.option.detail}` : row.option.label}
            >
              <Icon
                name={row.selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={iconSize.lg}
                color={row.selected ? t.brand.tint : t.icon.secondary}
              />
              <View style={styles.rowText}>
                <HighlightedText style={styles.name} text={row.option.label} words={words} numberOfLines={2} />
                {row.option.detail ? <Text style={styles.detail} numberOfLines={1}>{row.option.detail}</Text> : null}
              </View>
            </Pressable>
          )
        }
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.message}>
              {failed
                ? pickerText(field.noun, 'loadFailed')
                : query.trim().length >= SEARCH_MIN_LENGTH
                  ? pickerText(field.noun, 'noMatch', query.trim())
                  : pickerText(field.noun, 'typeToSearch')}
            </Text>
          )
        }
      />
    </View>
  );
}

export default OptionPicker;
