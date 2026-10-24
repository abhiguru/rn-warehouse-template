/**
 * The one layout of a report (docs/STYLE_GUIDE.md §14.10), top to bottom:
 *
 *   header (title, whose data, one export action)
 *   search field and filter bar (sort, period, filters)   - in every state
 *   figures (KPIs), what they cover, then the rows
 *
 * It owns every state a report can be in, so the reports cannot differ in them:
 * first load (skeleton), failed with nothing to show (error and retry), failed
 * with an earlier answer on screen (the rows stay, with a message saying they
 * are not current), nothing there, and nothing matching the search or filters.
 * The figures stay on screen in the last three, and every one can be pulled to
 * refresh.
 */
import React, { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { IconName } from '@/types/icon.types';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ListSkeleton } from '@/components/skeletons/ListSkeleton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FilterBar } from '@/features/filters/components/FilterBar';
import { filteredEmptyProps, type EmptyNounPlural } from '@/features/filters/components/FilteredListHeader';
import { ListSearchField } from '@/features/filters/components/ListSearchField';
import type { CountableFilterList } from '@/features/filters/configs';
import type { useListFilters } from '@/features/filters/useListFilters';
import type { ReportQuery } from '@/features/reports/useReportQuery';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { KPIGrid, type KPIItem } from './KPIGrid';
import { ReportEmptyState } from './ReportEmptyState';
import { ReportHeader, type ReportHeaderAction } from './ReportHeader';
import { ReportStatusLine, type ReportStatusLineProps } from './ReportStatusLine';

/** The button of a report's "nothing there" state. */
export interface ReportEmptyAction {
  label: string;
  onPress: () => void;
  /** MaterialCommunityIcons name. Defaults to a calendar, for the period. */
  icon?: IconName;
}

/** A group of figures with the heading of what they cover. */
export interface ReportKpiGroup {
  title: string;
  items: KPIItem[];
}

interface ReportScaffoldBaseProps<T> {
  title: string;
  /** Whose data this is: "All customers" or the customer's name. */
  subtitle?: string;
  onBack?: () => void;
  /** Header actions. A report has at most one that exports. */
  actions?: ReportHeaderAction[];

  /**
   * The search is sent to the server (item stock), so the field shows a spinner while
   * the answer is fetched. Default false: the search runs on the phone over rows already
   * read, and a background refresh must not hide the clear button behind a spinner.
   */
  searchIsServerSide?: boolean;

  /** The state of the report's data. `isKeptCopy` adds "Saved copy, refreshing…" to the status line while it is asked again. */
  query: Pick<ReportQuery<unknown>, 'phase' | 'isRefreshing' | 'isFetching' | 'error' | 'refresh' | 'retry' | 'updatedAt'> &
    Partial<Pick<ReportQuery<unknown>, 'isKeptCopy'>>;

  /** The figures over the rows. They describe the whole result, not the rows a search leaves. */
  kpis?: KPIItem[];
  /**
   * The figures in groups that cover different things, each under a heading that says what
   * ("In 1 Sep – 30 Sep", "Right now"), in place of `kpis`. A group with no figures is left out.
   */
  kpiGroups?: ReportKpiGroup[];
  /** How many figure tiles the first load shows. */
  kpiPlaceholders?: number;
  /** What the status line says. `updatedAt` and `refreshingKeptCopy` come from the query. */
  status?: Omit<ReportStatusLineProps, 'updatedAt' | 'refreshingKeptCopy'>;
  /** Between the status line and the rows: charts, bucket bars. */
  children?: React.ReactNode;

  rows: readonly T[];
  renderRow: (row: T, index: number) => React.ReactElement | null;
  keyExtractor: (row: T, index: number) => string;
  /** For rows of more than one shape (date headings between cards). */
  getRowType?: (row: T) => string;
  /** Anything the rows are drawn from besides the row itself. */
  extraData?: unknown;
  /** Under the rows: totals, or a further section. */
  footer?: React.ReactNode;
  onEndReached?: () => void;

  /**
   * Shown when there are no rows and nothing narrows them. `action` is the button
   * under it, for a way out the description suggests ("Choose a longer period").
   */
  empty: { icon: IconName; title: string; description?: string; action?: ReportEmptyAction };
  /** Title of the failure with nothing to show. The reason is shown under it. */
  errorTitle?: string;
}

/** The search, filters, sort and period, and what the rows are for "No GRNs match ...": the noun is needed only with filters. */
type ReportScaffoldFilterProps =
  | { filters: { config: CountableFilterList; state: ReturnType<typeof useListFilters> }; noun: EmptyNounPlural }
  /** A report with no search, filters, sort or period (the sensors list): nothing can narrow its rows. */
  | { filters?: undefined; noun?: EmptyNounPlural };

export type ReportScaffoldProps<T> = ReportScaffoldBaseProps<T> & ReportScaffoldFilterProps;

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  stale: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginHorizontal: layout.marginCompact,
    marginTop: space.md,
    paddingLeft: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: t.status.negative.border,
    backgroundColor: t.status.negative.background,
  },
  staleBody: { flex: 1, paddingVertical: space.sm, gap: space.xxs },
  staleText: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.text.primary },
  staleReason: { ...typography.footnote, color: t.text.secondary },
  staleRetry: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: space.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  staleRetryPressed: { backgroundColor: t.interaction.pressedOverlay },
  staleRetryText: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.brand.tint },
});

function ReportScaffoldInner<T>({
  title,
  subtitle,
  onBack,
  actions,
  filters,
  searchIsServerSide = false,
  query,
  kpis,
  kpiGroups,
  kpiPlaceholders = 2,
  status,
  children,
  rows,
  renderRow,
  keyExtractor,
  getRowType,
  extraData,
  footer,
  onEndReached,
  noun,
  empty,
  errorTitle,
}: ReportScaffoldProps<T>) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { phase, error, retry, refresh, isRefreshing, isFetching, updatedAt } = query;
  // The last row clears the system navigation bar (three-button Android, iOS home indicator).
  const listContentStyle = useMemo(() => ({ paddingBottom: space.xxl + insets.bottom }), [insets.bottom]);

  const head = (
    <>
      <ReportHeader title={title} subtitle={subtitle} onBack={onBack} actions={actions} />
      {filters?.config.search ? (
        <ListSearchField
          // Per customer for one customer's report: its recent searches are not another's (SR-06).
          listKey={filters.state.recentKey ?? filters.config.listKey}
          value={filters.state.search}
          onSearch={filters.state.setSearch}
          placeholder={filters.config.search.placeholder}
          // A search run on the phone has nothing to wait for: keep the clear button. A server
          // search shows the spinner until it is answered, also over the skeleton of a new search.
          loading={searchIsServerSide && isFetching}
        />
      ) : null}
      {filters ? <FilterBar config={filters.config} filters={filters.state} /> : null}
    </>
  );

  const renderItem = useCallback(({ item, index }: { item: T; index: number }) => renderRow(item, index), [renderRow]);
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isRefreshing}
        onRefresh={refresh}
        colors={[t.brand.tint]}
        tintColor={t.brand.tint}
        progressBackgroundColor={t.surface.card}
      />
    ),
    [isRefreshing, refresh, t]
  );

  if (phase === 'loading') {
    return (
      <View style={styles.container}>
        {head}
        {/* The grid keeps its own side margin: wrapped in another, the tiles would sit twice as far in as the rows. */}
        {/*
          One element for the screen reader, "Loading figures", instead of one unnamed
          ", loading" per placeholder tile.
        */}
        {kpiPlaceholders > 0 ? (
          <View accessible accessibilityLabel={tr('reports.components.kpisLoading')} accessibilityState={{ busy: true }}>
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <KPIGrid
                items={Array.from({ length: kpiPlaceholders }, () => ({ icon: 'circle-outline', value: '—', label: '' }))}
                isLoading
                compact
              />
            </View>
          </View>
        ) : null}
        <ListSkeleton count={4} metricsCount={2} showFooter={false} />
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.container}>
        {head}
        <ReportEmptyState
          icon="alert-circle-outline"
          tone="error"
          message={errorTitle ?? tr('reports.shared.errorTitle')}
          description={error ?? undefined}
          actionLabel={tr('common.retry')}
          onAction={retry}
        />
      </View>
    );
  }

  const listHeader = (
    <>
      {error ? (
        // The rows below were read earlier: say so, and why, where the person is looking.
        <View style={styles.stale} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Icon name="alert-circle-outline" size={iconSize.md} color={t.status.negative.element} />
          <View style={styles.staleBody}>
            <Text style={styles.staleText}>{tr('reports.scaffold.notUpdated')}</Text>
            <Text style={styles.staleReason}>{error}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.staleRetry, pressed && styles.staleRetryPressed]}
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel={tr('common.retry')}
          >
            <Text style={styles.staleRetryText} maxFontSizeMultiplier={1.6}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {kpiGroups ? <KpiGroups groups={kpiGroups} /> : kpis && kpis.length > 0 ? <KPIGrid items={kpis} compact /> : null}
      <ReportStatusLine {...status} updatedAt={updatedAt} refreshingKeptCopy={Boolean(query.isKeptCopy) && isFetching} />
      {children}
    </>
  );

  return (
    <View style={styles.container}>
      {head}
      <FlashList
        data={rows as T[]}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getRowType}
        extraData={extraData}
        // A new sort or search must not stay anchored on the row that was on top before.
        maintainVisibleContentPosition={{ disabled: true }}
        contentContainerStyle={listContentStyle}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <ListEmptyState
            {...(filters && noun
              ? filteredEmptyProps(filters.state, noun)
              : { activeFilterCount: 0 })}
            emptyIcon={empty.icon}
            emptyTitle={empty.title}
            // Without a description the list's own default ("Items you create appear here.") would show.
            emptySubtitle={empty.description ?? ''}
            showCreateButton={Boolean(empty.action)}
            createButtonLabel={empty.action?.label}
            createButtonIcon={empty.action ? empty.action.icon ?? 'calendar-range' : undefined}
            onCreatePress={empty.action?.onPress}
          />
        }
        ListFooterComponent={footer ? <>{footer}</> : null}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

/** Each group of figures under its heading (a header for screen readers), in the order given. */
function KpiGroups({ groups }: { groups: ReportKpiGroup[] }) {
  return (
    <>
      {groups
        .filter(group => group.items.length > 0)
        .map(group => (
          <View key={group.title}>
            <SectionHeader title={group.title} />
            <KPIGrid items={group.items} compact />
          </View>
        ))}
    </>
  );
}

/** Generic over the row type; `React.memo` would lose it. */
export const ReportScaffold = ReportScaffoldInner;
export default ReportScaffold;
