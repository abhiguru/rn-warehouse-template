/**
 * The line under a report's figures that says what they cover: the dates, when
 * they were read, and how many of the rows are shown (docs/STYLE_GUIDE.md §14.9, §14.10).
 */
import React from 'react';
import { View } from 'react-native';
import { describeDateRange } from '@/features/filters/filterModel';
import { useThemedStyles } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { formatNumber, formatTime } from '@/utils/formatters';
import { FactLines } from './FactLines';

export interface ReportStatusLineProps {
  /** The days the report covers. Left out for a report of today's stock. */
  range?: { from?: string; to?: string };
  /** When the figures on screen were read. */
  updatedAt?: number;
  /** Rows on screen and rows in all, when a search, a filter or paging shows fewer. */
  shown?: number;
  total?: number;
}

const makeStyles = (t: ThemeTokens) => ({
  wrap: { paddingHorizontal: layout.marginCompact, paddingVertical: space.sm },
  text: { ...typography.footnote, color: t.text.secondary },
});

export function ReportStatusLine({ range, updatedAt, shown, total }: ReportStatusLineProps) {
  const styles = useThemedStyles(makeStyles);
  const facts = [
    range && (range.from || range.to) ? describeDateRange(range) : null,
    typeof shown === 'number' && typeof total === 'number' && shown < total
      ? tr('reports.scaffold.showing', { shown: formatNumber(shown), total: formatNumber(total) })
      : null,
    updatedAt ? tr('reports.scaffold.updated', { time: formatTime(new Date(updatedAt)) }) : null,
  ];
  if (!facts.some(Boolean)) return null;
  return (
    <View style={styles.wrap}>
      <FactLines facts={facts} style={styles.text} numberOfLines={2} />
    </View>
  );
}

export default ReportStatusLine;
