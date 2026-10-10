/**
 * Sort and filter: every filter of one list on a single page
 * (docs/STYLE_GUIDE.md §14.5; SAP Fiori "sort and filter").
 *
 * Changes are a draft until "Show N items". Long choices (customers, items)
 * open inside this page with Back, never as a second sheet. Closing with
 * unsaved changes asks first.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ApplyFiltersButton } from '@/features/filters/components/ApplyFiltersButton';
import { pickerText } from '@/features/filters/components/editors/OptionPicker';
import { SortEditor } from '@/features/filters/components/editors/SortEditor';
import { FieldEditor } from '@/features/filters/components/FieldEditor';
import { FILTER_CONFIGS, type CountableFilterList } from '@/features/filters/configs';
import { describeValue, isFieldActive, normalizeValues, valuesEqual } from '@/features/filters/filterModel';
import type { FilterValue, FilterValues, PickerField, SortState } from '@/features/filters/types';
import { useFilterResultCount } from '@/features/filters/useFilterResultCount';
import { useListFilters } from '@/features/filters/useListFilters';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens, singleLineText } from '@/theme/tokens';
import { showAlert } from '@/utils/alert';

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget + space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: 1,
    borderBottomColor: t.border.separator,
  },
  headerSide: { minWidth: 72, minHeight: touchTarget, justifyContent: 'center' as const, paddingHorizontal: space.sm },
  headerEnd: { alignItems: 'flex-end' as const },
  headerTitle: { ...typography.headline, flex: 1, textAlign: 'center' as const, color: t.text.primary },
  headerAction: { ...typography.callout, color: t.brand.tint },
  headerActionDisabled: { color: t.text.disabled },
  pressed: { opacity: 0.6 },
  body: { flex: 1 },
  content: { padding: layout.marginCompact, gap: space.lg },
  section: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
  },
  sectionTitle: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.text.secondary },
  pickerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    gap: space.md,
  },
  pickerText: { flex: 1, gap: space.xxs },
  pickerLabel: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.text.secondary },
  pickerValue: { ...typography.body, color: t.text.primary },
  pickerValueEmpty: { color: t.text.secondary },
  pickerScreen: { flex: 1, padding: layout.marginCompact },
  footer: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    backgroundColor: t.surface.header,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
  },
  missing: { ...typography.body, color: t.text.secondary, textAlign: 'center' as const, padding: space.xxl },
});

function SortAndFilterPage({ config }: { config: CountableFilterList }) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const filters = useListFilters(config as never);

  // The draft starts from what is in effect, including the search, which this page does not edit.
  const [values, setValues] = useState<FilterValues>(filters.values);
  const [sort, setSort] = useState<SortState | undefined>(filters.sort);
  const [picker, setPicker] = useState<PickerField | null>(null);
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  // Counts presses of Reset: fields that keep typed text remount then, and only then.
  const [resets, setResets] = useState(0);

  const normalised = useMemo(() => normalizeValues(config, values, filters.ctx), [config, values, filters.ctx]);
  const dirty =
    !valuesEqual(normalised, filters.values) ||
    sort?.field !== filters.sort?.field ||
    sort?.order !== filters.sort?.order;
  const result = useFilterResultCount(config, normalised, sort, filters.ctx);
  const anyInvalid = Object.values(invalid).some(Boolean);
  const hasDraftFilters =
    filters.fields.some(field => isFieldActive(field, values[field.key])) ||
    (config.sort ? sort?.field !== config.sort.default.field || sort?.order !== config.sort.default.order : false);

  const setField = (key: string, value: FilterValue | undefined) => setValues(previous => ({ ...previous, [key]: value }));

  const close = useCallback(() => {
    if (!dirty) {
      router.back();
      return;
    }
    showAlert(translate('common.discardChangesTitle'), translate('filters.page.discardMessage'), [
      { text: translate('common.keepEditing'), style: 'cancel' },
      { text: translate('common.discard'), style: 'destructive', onPress: () => router.back() },
    ]);
  }, [dirty]);

  // Android back: leave the picker first, then the page (asking when there are changes).
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (picker) setPicker(null);
      else close();
      return true;
    });
    return () => subscription.remove();
  }, [picker, close]);

  const reset = () => {
    // Clear every filter and the sort; the search belongs to the list and stays.
    setValues(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => key.startsWith('search'))));
    setSort(config.sort?.default);
    setInvalid({});
    setResets(count => count + 1);
  };
  const apply = () => {
    filters.apply(values, sort);
    router.back();
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      {picker ? (
        <Pressable
          style={({ pressed }) => [styles.headerSide, pressed && styles.pressed]}
          onPress={() => setPicker(null)}
          accessibilityRole="button"
          accessibilityLabel={translate('filters.page.back')}
        >
          <Icon name="arrow-left" size={iconSize.lg} color={t.brand.tint} />
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.headerSide, pressed && styles.pressed]}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={translate('filters.page.close')}
        >
          <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
        </Pressable>
      )}
      <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.6}>
        {picker ? picker.label : translate('filters.page.title')}
      </Text>
      <View style={[styles.headerSide, styles.headerEnd]}>
        {picker ? (
          <Pressable
            style={({ pressed }) => pressed && styles.pressed}
            onPress={() => setPicker(null)}
            hitSlop={space.md}
            accessibilityRole="button"
            accessibilityLabel={pickerText(picker.noun, 'done')}
          >
            <Text style={styles.headerAction} maxFontSizeMultiplier={1.6} {...singleLineText()}>{translate('common.done')}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => pressed && styles.pressed}
            onPress={reset}
            disabled={!hasDraftFilters}
            hitSlop={space.md}
            accessibilityRole="button"
            accessibilityLabel={translate('filters.page.resetLabel')}
            accessibilityState={{ disabled: !hasDraftFilters }}
          >
            <Text style={[styles.headerAction, !hasDraftFilters && styles.headerActionDisabled]} maxFontSizeMultiplier={1.6} {...singleLineText()}>{translate('common.reset')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  if (picker) {
    return (
      <View style={styles.screen}>
        {header}
        <KeyboardAvoidingView style={styles.body} behavior="padding">
          <View style={[styles.pickerScreen, { paddingBottom: space.lg + insets.bottom }]}>
            <FieldEditor field={picker} value={values[picker.key]} onChange={value => setField(picker.key, value)} ctx={filters.ctx} />
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <KeyboardAvoidingView style={styles.body} behavior="padding">
        <ScrollView style={styles.body} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {config.sort && sort ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">{translate('filters.page.sortByHeading')}</Text>
              <SortEditor options={config.sort.options} value={sort} onChange={setSort} />
            </View>
          ) : null}
          {filters.fields.map(field =>
            field.kind === 'picker' ? (
              <Pressable
                key={field.key}
                style={({ pressed }) => [styles.section, pressed && styles.pressed]}
                onPress={() => setPicker(field)}
                accessibilityRole="button"
                accessibilityLabel={
                  isFieldActive(field, values[field.key])
                    ? translate('filters.page.pickerRowSet', { label: field.label, value: describeValue(field, values[field.key]) })
                    : translate('filters.page.pickerRowAny', { label: field.label })
                }
              >
                <View style={styles.pickerRow}>
                  <View style={styles.pickerText}>
                    <Text style={styles.pickerLabel}>{field.label.toUpperCase()}</Text>
                    <Text
                      style={[styles.pickerValue, !isFieldActive(field, values[field.key]) && styles.pickerValueEmpty]}
                      numberOfLines={2}
                    >
                      {isFieldActive(field, values[field.key]) ? describeValue(field, values[field.key]) : translate('common.any')}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={iconSize.lg} color={t.icon.secondary} />
                </View>
              </Pressable>
            ) : (
              <View key={field.key} style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {field.kind === 'numberRange' && field.unit
                    ? translate('filters.page.sectionWithUnit', { label: field.label.toUpperCase(), unit: field.unit.toUpperCase() })
                    : field.label.toUpperCase()}
                </Text>
                <FieldEditor
                  // Remount after Reset so fields that keep typed text start empty. Never while
                  // typing: a remount there would drop the keyboard focus after one character.
                  key={resets}
                  field={field}
                  value={values[field.key]}
                  onChange={value => setField(field.key, value)}
                  ctx={filters.ctx}
                  onInvalid={bad => setInvalid(previous => ({ ...previous, [field.key]: bad }))}
                />
              </View>
            )
          )}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>
          <ApplyFiltersButton result={result} noun={config.noun} onPress={apply} disabled={anyInvalid} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function ListFiltersScreen() {
  const styles = useThemedStyles(makeStyles);
  const { listKey } = useLocalSearchParams<{ listKey?: string }>();
  const config = listKey ? FILTER_CONFIGS[listKey] : undefined;
  if (!config) {
    return (
      <View style={styles.screen}>
        <Text style={styles.missing}>{translate('filters.page.noFilters')}</Text>
      </View>
    );
  }
  return <SortAndFilterPage config={config} />;
}
