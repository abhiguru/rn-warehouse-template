/**
 * ReportDateHeading: the day over a report's rows of that day, shown while the
 * rows are sorted by date (docs/STYLE_GUIDE.md §12.3, §14.5). A section heading:
 * `footnote` semibold, upper case, `text.secondary`, inset to the cards' text.
 */
import React, { memo } from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { fontWeight, layout, space, trackedText, typography, type ThemeTokens } from '@/theme/tokens';
import { formatIndiaSectionDate } from '@/utils/formatters';

export interface ReportDateHeadingProps {
  /**
   * The day, as the server sends it ("2026-10-09"), or the instant of a row: either is read on
   * India's calendar, and "Today" and "Yesterday" are India's, as the report's period is.
   */
  date: string;
}

const makeStyles = (t: ThemeTokens) => ({
  heading: {
    paddingTop: space.lg,
    paddingBottom: space.sm,
    paddingHorizontal: layout.marginCompact + space.xs,
  },
  text: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: trackedText(0.5),
    textTransform: 'uppercase' as const,
    color: t.text.secondary,
  },
});

export const ReportDateHeading = memo(function ReportDateHeading({ date }: ReportDateHeadingProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.heading}>
      <Text style={styles.text} accessibilityRole="header">
        {formatIndiaSectionDate(date)}
      </Text>
    </View>
  );
});

export default ReportDateHeading;
