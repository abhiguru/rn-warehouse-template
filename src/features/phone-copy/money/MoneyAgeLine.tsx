/**
 * How old the figures on screen are (WH-305, Design offline-capture.md 8.1 and 8.6): the first line under the header of
 * Customer dues, a Statement and Customer activity. Figures computed today are a footnote line; figures from an earlier day
 * are an `info` message strip, because a past day's balance is short of today's. A customer account reads the strip in every
 * state (WH-306, Design 9.1 and 9.7 DQ2, DQ4). When a refresh failed (DQ3) the sentence and "Try again" follow at the end.
 * The time is the answer's own, never the time it reached the phone.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { formatLoadedAt, formatSpokenDateTime } from '@/utils/formatters';
import { copyKindOf, signedInRole } from '../copyKind';
import { businessDate } from '../pgCompat';
import { moneyAge, phoneBusinessDay } from './moneyAge';

const makeStyles = (t: ThemeTokens) => ({
  wrap: { marginHorizontal: space.lg, marginTop: space.sm, gap: space.xs },
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  lineText: { ...typography.footnote, color: t.text.secondary, flexShrink: 1 },
  strip: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.button,
    borderWidth: 1,
    backgroundColor: t.status.informative.background,
    borderColor: t.status.informative.border,
  },
  stripText: { ...typography.footnote, color: t.status.informative.text, flexShrink: 1 },
  failed: { flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const, gap: space.sm },
  failedText: { ...typography.footnote, color: t.text.secondary },
  retry: { minHeight: touchTarget, minWidth: touchTarget, justifyContent: 'center' as const },
  retryText: { ...typography.footnote, fontWeight: '600' as const, color: t.brand.tint },
});

interface MoneyAgeLineProps {
  /** The answer's own time (ISO). */
  asOf: string;
  /** The answer's business day; empty for an older server (the day of `asOf` is used). */
  today: string | null;
  /** Goods in store, by the answer or the copy's stock: keeps the rent sentence. */
  hasStock: boolean;
  /** A refresh failed with this answer on screen: the sentence and "Try again" follow. */
  refreshFailed?: boolean;
  onRetry?: () => void;
}

export function MoneyAgeLine({ asOf, today, hasStock, refreshFailed = false, onRetry }: MoneyAgeLineProps) {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const when = new Date(asOf);
  const phoneDay = phoneBusinessDay();
  const age = moneyAge({ asOf, today: today !== null && today !== '' ? today : businessDate(asOf), phoneDay, hasStock });
  const dateTime = formatLoadedAt(when.getTime());
  const footnote = age === 'today' && copyKindOf(signedInRole()) !== 'customer';
  const words = (spoken: string): string =>
    age === 'today'
      ? tr('money.asOfToday', { time: dateTime })
      : tr(age === 'earlier' ? 'money.asOfEarlier' : 'money.asOfEarlierNoStock', { dateTime: spoken });
  return (
    <View style={styles.wrap}>
      {footnote ? (
        <View style={styles.line} testID="money-age-line" accessible accessibilityLabel={tr('money.asOfToday', { time: dateTime })}>
          <Icon name="clock-outline" size={iconSize.sm} color={tokens.icon.secondary} importantForAccessibility="no" />
          <Text style={styles.lineText}>{tr('money.asOfToday', { time: dateTime })}</Text>
        </View>
      ) : (
        <View
          style={styles.strip}
          testID="money-age-strip"
          accessible
          accessibilityLabel={words(formatSpokenDateTime(when))}
        >
          <Icon name="clock-outline" size={iconSize.sm} color={tokens.status.informative.text} importantForAccessibility="no" />
          <Text style={styles.stripText}>{words(dateTime)}</Text>
        </View>
      )}
      {refreshFailed ? (
        <View style={styles.failed}>
          <Text style={styles.failedText}>{tr('money.refreshFailed')}</Text>
          <Pressable
            style={styles.retry}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={tr('components.offlineStatus.retryLabel')}
          >
            <Text style={styles.retryText}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
