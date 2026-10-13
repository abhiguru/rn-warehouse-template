/**
 * The line under a report's figures that says what they cover: the dates, when
 * they were read, and how many of the rows are shown (docs/STYLE_GUIDE.md §14.9, §14.10).
 *
 * Figures kept on the phone can be days old, so "Last updated" names the day
 * unless it is today. The line wraps rather than cutting off (§4), and it is a
 * polite live region, so a screen reader hears "Showing 3 of 40" after a search.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { describeDateRange } from '@/features/filters/filterModel';
import { useThemedStyles } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { formatDateTime, formatNumber, formatTime } from '@/utils/formatters';
import { joinFacts, stacksFacts } from './FactLines';

export interface ReportStatusLineProps {
  /** The days the report covers. Left out for a report of today's stock. */
  range?: { from?: string; to?: string };
  /** When the figures on screen were read. */
  updatedAt?: number;
  /** Rows on screen and rows in all, when a search, a filter or paging shows fewer. */
  shown?: number;
  total?: number;
  /**
   * The figures are the copy kept on the phone and the facility is being asked again:
   * "Saved copy, refreshing…" beside "Last updated" (SR-10). The failure banner, not this
   * line, says when that request fails.
   */
  refreshingKeptCopy?: boolean;
}

const makeStyles = (t: ThemeTokens) => ({
  wrap: { paddingHorizontal: layout.marginCompact, paddingVertical: space.sm },
  text: { ...typography.footnote, color: t.text.secondary },
});

/** "4:05 pm" today, "11 Oct 2026, 4:05 pm" on any other day (§12.3). */
export function describeUpdatedAt(updatedAt: number, now: Date = new Date()): string {
  const at = new Date(updatedAt);
  return at.toDateString() === now.toDateString() ? formatTime(at) : formatDateTime(at);
}

export function ReportStatusLine({ range, updatedAt, shown, total, refreshingKeptCopy = false }: ReportStatusLineProps) {
  const styles = useThemedStyles(makeStyles);
  const facts = [
    range && (range.from || range.to) ? describeDateRange(range) : null,
    typeof shown === 'number' && typeof total === 'number' && shown < total
      ? tr('reports.scaffold.showing', { shown: formatNumber(shown), total: formatNumber(total) })
      : null,
    refreshingKeptCopy ? tr('reports.scaffold.keptCopyRefreshing') : null,
    updatedAt ? tr('reports.scaffold.updated', { time: describeUpdatedAt(updatedAt) }) : null,
  ].filter((fact): fact is string => Boolean(fact));
  if (facts.length === 0) return null;
  // No line limit in either language: the line wraps, it never loses "Last updated".
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      {stacksFacts() ? (
        facts.map((fact, index) => (
          <Text key={index} style={styles.text}>
            {fact}
          </Text>
        ))
      ) : (
        <Text style={styles.text}>{joinFacts(facts)}</Text>
      )}
    </View>
  );
}

export default ReportStatusLine;
