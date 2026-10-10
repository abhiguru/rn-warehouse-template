/**
 * The header of a list with search and filters (docs/STYLE_GUIDE.md §13.8, §14.5):
 *
 *   title row   · expand all · extra actions · profile
 *   [children]    for example the Orders | Queue switch
 *   search field
 *   filter bar    Filters, sort, active filters, fast filters, Clear all
 *
 * It is shown in every state of the list, so a search or filter can always be
 * changed or cleared: while loading, on an error and when nothing matches.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Avatar } from '@/components/ui/Avatar';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { useAppSelector } from '@/store/hooks';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { FILTER_CONFIGS } from '../configs';
import type { FilterListDefinition } from '../types';
import type { useListFilters } from '../useListFilters';
import { FilterBar } from './FilterBar';
import { ListSearchField } from './ListSearchField';

export interface FilteredListHeaderProps {
  title: string;
  config: FilterListDefinition;
  filters: ReturnType<typeof useListFilters>;
  /** The list is loading results for the current search or filters. */
  loading?: boolean;
  /** Expand or collapse every card. Omit for lists whose rows do not expand. */
  expand?: { expanded: boolean; onToggle: () => void; nounPlural: string; disabled?: boolean };
  /** Extra buttons in the title row, before the profile. */
  actions?: React.ReactNode;
  /** Shown between the title row and the search field. */
  children?: React.ReactNode;
}

const makeStyles = (t: ThemeTokens) => ({
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.sm,
    paddingVertical: space.xs,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  // Top-level tab title (guide §13.8): large title on every tab.
  title: { ...typography.largeTitle, color: t.text.primary, flexShrink: 1 },
  actions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconButtonPressed: { backgroundColor: t.surface.cardPressed },
  slot: { backgroundColor: t.surface.header },
});

export function FilteredListHeader({ title, config, filters, loading, expand, actions, children }: FilteredListHeaderProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const userProfile = useAppSelector(state => state.auth.userProfile);
  const countable = FILTER_CONFIGS[config.listKey];
  // The full page exists for lists with more filters than fit in the bar.
  const hasPage = config.fields.length > config.fastFilters.length || Boolean(config.sort);
  const openAll = () => router.push({ pathname: '/list-filters', params: { listKey: config.listKey } });

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        <View style={styles.actions}>
          {expand ? (
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              onPress={expand.onToggle}
              disabled={expand.disabled}
              accessibilityRole="button"
              accessibilityLabel={expand.expanded ? `Collapse all ${expand.nounPlural}` : `Expand all ${expand.nounPlural}`}
              accessibilityState={{ disabled: Boolean(expand.disabled), expanded: expand.expanded }}
            >
              <Icon
                name={expand.expanded ? 'unfold-less-horizontal' : 'unfold-more-horizontal'}
                size={iconSize.lg}
                color={t.icon.primary}
              />
            </Pressable>
          ) : null}
          {actions}
          <Pressable
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Avatar name={userProfile?.name || 'User'} id={userProfile?.id} size="sm" />
          </Pressable>
        </View>
      </View>
      {children ? <View style={styles.slot}>{children}</View> : null}
      {config.search ? (
        <ListSearchField
          listKey={config.listKey}
          value={filters.search}
          onSearch={filters.setSearch}
          placeholder={config.search.placeholder}
          loading={loading}
        />
      ) : null}
      {countable && (config.fields.length > 0 || config.sort) ? (
        <FilterBar config={countable} filters={filters} onOpenAll={hasPage ? openAll : undefined} />
      ) : null}
    </>
  );
}

/** Wording of a list's "nothing matches" state for `ListEmptyState`. */
export function filteredEmptyProps(filters: ReturnType<typeof useListFilters>, nounPlural: string) {
  const search = filters.search.trim();
  return {
    activeFilterCount: filters.hasAny ? 1 : 0,
    filteredTitle: search ? `No ${nounPlural} match "${search}"` : `No ${nounPlural} match your filters`,
    filteredSubtitle: search
      ? 'Check the spelling, try fewer words, or remove a filter.'
      : 'Try removing a filter or clearing them all.',
    clearFiltersLabel: search ? 'Clear search and filters' : 'Clear filters',
    onClearFilters: filters.clear,
  };
}

export default FilteredListHeader;
