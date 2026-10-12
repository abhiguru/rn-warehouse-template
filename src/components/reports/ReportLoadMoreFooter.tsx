/**
 * The footer under the rows of a paged report (docs/STYLE_GUIDE.md §13.6:
 * "infinite scroll loads 25 to 50 at a time with a footer spinner").
 *
 *   more      a button that loads the next page, for whoever does not scroll
 *             to the end (a screen reader, a list shorter than the screen)
 *   loading   a spinner and what is loading
 *   failed    what failed, the server's reason and "Try again"; the next page
 *             is then asked for only by that button, not by scrolling
 *   none      nothing: every row is loaded, or the report has no rows yet
 *
 * The texts come from the report, which knows what its rows are.
 */
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { space, typography, type ThemeTokens } from '@/theme/tokens';

export type ReportLoadMoreState = 'none' | 'more' | 'loading' | 'failed';

export interface ReportLoadMoreFooterProps {
  state: ReportLoadMoreState;
  /** "Loading more items" */
  loadingText: string;
  /** "Couldn't load more items." */
  failedText: string;
  /** The server's reason for the failure, shown under `failedText`. */
  reason?: string | null;
  /** "Show more items" */
  moreLabel: string;
  onLoadMore: () => void;
  onRetry: () => void;
}

const makeStyles = (t: ThemeTokens) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingVertical: space.lg,
  },
  column: { alignItems: 'center' as const, gap: space.sm, paddingVertical: space.lg, paddingHorizontal: space.lg },
  text: { ...typography.footnote, color: t.text.secondary, textAlign: 'center' as const },
  errorText: { ...typography.footnote, color: t.status.negative.text, textAlign: 'center' as const },
});

export function ReportLoadMoreFooter({ state, loadingText, failedText, reason, moreLabel, onLoadMore, onRetry }: ReportLoadMoreFooterProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  switch (state) {
    case 'loading':
      return (
        <View style={styles.row} accessibilityRole="progressbar" accessibilityLabel={loadingText} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={t.brand.tint} />
          <Text style={styles.text}>{loadingText}</Text>
        </View>
      );
    case 'failed':
      return (
        <View style={styles.column} accessibilityLiveRegion="polite">
          <Text style={styles.errorText} accessibilityRole="alert">{failedText}</Text>
          {reason ? <Text style={styles.text}>{reason}</Text> : null}
          <Button type="tertiary" size="compact" onPress={onRetry}>
            {tr('common.retry')}
          </Button>
        </View>
      );
    case 'more':
      return (
        <View style={styles.column}>
          <Button type="tertiary" size="compact" onPress={onLoadMore}>
            {moreLabel}
          </Button>
        </View>
      );
    default:
      return null;
  }
}

export default ReportLoadMoreFooter;
