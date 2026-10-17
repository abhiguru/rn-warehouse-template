/**
 * Inline load errors for a list that still shows rows (style guide §13.9: an
 * error the person must act on is a message strip, never a snackbar).
 *
 * - `StaleListStrip`: a refresh failed; the rows shown are the ones loaded
 *   before. Critical message strip with "Try again". It stays until a refresh
 *   succeeds.
 * - `LoadMoreErrorFooter`: the next page failed; the list's last row says so,
 *   with "Try again".
 * - `LastUpdatedLine`: while the phone is offline, "Last updated 10:42 pm"
 *   (§14.9), so cards that live updates can no longer refresh say how old they are.
 *
 * A list with no rows uses `ErrorStateView` instead.
 */
import React from 'react';
import { Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { formatTime } from '@/utils/formatters';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

interface StaleListStripProps {
  title: string;
  text: string;
  /** TalkBack wording of the button, e.g. "Try loading the orders again". */
  retryLabel: string;
  onRetry: () => void;
  /** True while the retry runs: the button shows a spinner and is disabled. */
  retrying?: boolean;
  testID?: string;
}

export const StaleListStrip: React.FC<StaleListStripProps> = ({
  title,
  text,
  retryLabel,
  onRetry,
  retrying = false,
  testID = 'stale-list-strip',
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.strip} testID={testID}>
      <View style={styles.row} accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Icon name="alert" size={iconSize.md} color={t.status.critical.text} style={styles.icon} />
        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.text}>{text}</Text>
        </View>
      </View>
      <Button
        type="secondary"
        size="compact"
        onPress={onRetry}
        loading={retrying}
        disabled={retrying}
        accessibilityLabel={retryLabel}
        style={styles.button}
        testID={`${testID}-retry`}
      >
        {translate('common.retry')}
      </Button>
    </View>
  );
};

interface LoadMoreErrorFooterProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  testID?: string;
}

export const LoadMoreErrorFooter: React.FC<LoadMoreErrorFooterProps> = ({
  message,
  retryLabel,
  onRetry,
  testID = 'load-more-error',
}) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.footer} testID={testID}>
      <Text style={styles.footerText} accessibilityRole="alert" accessibilityLiveRegion="polite">
        {message}
      </Text>
      <Button
        type="tertiary"
        size="compact"
        onPress={onRetry}
        accessibilityLabel={retryLabel}
        testID={`${testID}-retry`}
      >
        {translate('common.retry')}
      </Button>
    </View>
  );
};

interface LastUpdatedLineProps {
  /** When the rows shown were loaded (ms since epoch). */
  at: number;
  /** At the top of a list with no heading above it: room above the line. */
  top?: boolean;
  testID?: string;
}

export const LastUpdatedLine: React.FC<LastUpdatedLineProps> = ({ at, top = false, testID = 'last-updated' }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={[styles.updated, top && styles.updatedTop]} testID={testID}>
      {translate('lists.order.lastUpdated', { time: formatTime(new Date(at)) })}
    </Text>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  strip: {
    marginHorizontal: layout.marginCompact,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.status.critical.border,
    backgroundColor: t.status.critical.background,
    gap: space.sm,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
  },
  icon: {
    marginRight: space.sm,
  },
  body: {
    flex: 1,
  },
  title: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.status.critical.text,
  },
  text: {
    ...typography.footnote,
    color: t.status.critical.text,
  },
  button: {
    alignSelf: 'flex-end' as const,
  },
  footer: {
    alignItems: 'center' as const,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.lg,
    gap: space.xs,
  },
  updated: {
    ...typography.footnote,
    color: t.text.secondary,
    paddingHorizontal: layout.marginCompact,
    paddingBottom: space.sm,
  },
  updatedTop: {
    paddingTop: space.md,
  },
  footerText: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
});
