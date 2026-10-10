/**
 * The filter bar under a list's search field (docs/STYLE_GUIDE.md §14.5; SAP
 * Fiori "filter feedback bar"). One row that scrolls sideways:
 *
 *   [Filters n] [sort] [active filters ×] [fast filters ▾] [Clear all]
 *
 * It is both the quick way in and the display of what is applied, and its
 * height never changes, so the list below does not jump.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { layout, space, type ThemeTokens } from '@/theme/tokens';
import type { CountableFilterList } from '../configs';
import { describeDateRange, describeSort, describeValue, financialYearLabel, isFieldActive, readSearch } from '../filterModel';
import type { FilterFieldDef } from '../types';
import type { useListFilters } from '../useListFilters';
import { CHIP_HEIGHT, FilterBarChip } from './FilterBarChip';
import { SingleFilterSheet, type OpenFilter } from './SingleFilterSheet';

export interface FilterBarProps {
  config: CountableFilterList;
  filters: ReturnType<typeof useListFilters>;
  /** Open the full "Sort and filter" page. Omit for lists that have none. */
  onOpenAll?: () => void;
}

const makeStyles = (t: ThemeTokens) => ({
  bar: {
    backgroundColor: t.surface.header,
    borderBottomWidth: 1,
    borderBottomColor: t.border.separator,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: CHIP_HEIGHT + space.sm * 2,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
  },
});

const opensSheet = (field: FilterFieldDef) => field.kind !== 'toggle';

export function FilterBar({ config, filters, onOpenAll }: FilterBarProps) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState<OpenFilter>(null);
  const { fields, values, sort, activeCount } = filters;

  const active = fields.filter(field => isFieldActive(field, values[field.key]));
  const idleFast = config.fastFilters
    .map(key => fields.find(field => field.key === key))
    .filter((field): field is FilterFieldDef => Boolean(field) && !isFieldActive(field as FilterFieldDef, values[(field as FilterFieldDef).key]));
  const recognised = readSearch(config, values);
  const sortText = describeSort(config, sort);

  // When filters come or go the chips reorder: show the row from its start, where Filters and Sort are.
  const rowRef = useRef<ScrollView>(null);
  const activeKeys = active.map(field => field.key).join(',') + (recognised.date ? ',date' : '') + (recognised.range ? ',range' : '') + (recognised.financialYear !== undefined ? ',year' : '') + (filters.hasAny ? ',any' : '');
  useEffect(() => {
    rowRef.current?.scrollTo({ x: 0, animated: false });
  }, [activeKeys]);

  const press = (field: FilterFieldDef) => {
    if (opensSheet(field)) setOpen({ type: 'field', key: field.key });
    else filters.setField(field.key, isFieldActive(field, values[field.key]) ? undefined : true);
  };

  return (
    <View style={styles.bar}>
      <ScrollView ref={rowRef} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          {onOpenAll ? (
            <FilterBarChip
              variant="action"
              icon="tune-variant"
              label={translate('filters.bar.filters')}
              count={activeCount}
              onPress={onOpenAll}
              accessibilityLabel={activeCount > 0 ? translate('filters.bar.openAllApplied', { count: activeCount }) : translate('filters.bar.openAll')}
            />
          ) : null}
          {config.sort && sort ? (
            <FilterBarChip
              variant="action"
              icon={sort.order === 'desc' ? 'arrow-down' : 'arrow-up'}
              label={sortText.label}
              chevron
              onPress={() => setOpen({ type: 'sort' })}
              accessibilityLabel={translate('filters.bar.sortedBy', { label: sortText.label, direction: sortText.spoken })}
            />
          ) : null}
          {active.map(field => {
            const value = describeValue(field, values[field.key]);
            return (
              <FilterBarChip
                key={field.key}
                variant="active"
                label={value}
                onPress={() => press(field)}
                onRemove={() => filters.setField(field.key, undefined)}
                // A switch has no value to name: "With items, on", not "With items: With items".
                accessibilityLabel={
                  opensSheet(field)
                    ? translate('filters.bar.activeChip', { label: field.label, value })
                    : translate('filters.bar.toggleOn', { label: field.label })
                }
                removeAccessibilityLabel={
                  opensSheet(field)
                    ? translate('filters.bar.removeFilterValue', { label: field.label, value })
                    : translate('filters.bar.removeFilter', { name: field.label })
                }
              />
            );
          })}
          {recognised.date ? (
            <FilterBarChip
              variant="active"
              icon="magnify"
              label={describeDateRange(recognised.date)}
              onPress={filters.searchAsText}
              onRemove={filters.searchAsText}
              accessibilityLabel={translate('filters.bar.searchDate', { date: describeDateRange(recognised.date) })}
              removeAccessibilityLabel={translate('filters.bar.removeSearchDate', { date: describeDateRange(recognised.date) })}
            />
          ) : null}
          {recognised.range ? (
            <FilterBarChip
              variant="active"
              icon="magnify"
              label={translate('filters.chip.textBetween', { from: recognised.range.from, to: recognised.range.to })}
              onPress={filters.searchAsText}
              onRemove={filters.searchAsText}
              accessibilityLabel={translate('filters.bar.searchRange', { from: recognised.range.from, to: recognised.range.to })}
              removeAccessibilityLabel={translate('filters.bar.removeSearchRange', { from: recognised.range.from, to: recognised.range.to })}
            />
          ) : null}
          {recognised.financialYear !== undefined ? (
            <FilterBarChip
              variant="active"
              icon="magnify"
              label={financialYearLabel(recognised.financialYear)}
              onPress={filters.searchAsText}
              onRemove={filters.searchAsText}
              accessibilityLabel={translate('filters.bar.searchYear', { year: financialYearLabel(recognised.financialYear) })}
              removeAccessibilityLabel={translate('filters.bar.removeSearchYear', { year: financialYearLabel(recognised.financialYear) })}
            />
          ) : null}
          {idleFast.map(field => (
            <FilterBarChip
              key={field.key}
              label={field.label}
              chevron={opensSheet(field)}
              onPress={() => press(field)}
              accessibilityLabel={opensSheet(field) ? translate('filters.bar.filterBy', { label: field.label.toLowerCase() }) : field.label}
              selected={opensSheet(field) ? undefined : false}
            />
          ))}
          {filters.hasAny ? (
            <FilterBarChip variant="text" label={translate('common.clearAll')} onPress={filters.clear} accessibilityLabel={translate('filters.bar.clearAllLabel')} />
          ) : null}
        </View>
      </ScrollView>
      <SingleFilterSheet config={config} filters={filters} open={open} onClose={() => setOpen(null)} />
    </View>
  );
}

export default FilterBar;
