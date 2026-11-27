/**
 * Replaced entries (WH-303; product/design/offline-capture.md 6.3): the changes that overwrote someone's newer entry,
 * newest first, for administrators. The last 120 days to begin with; an older period by the dates. Each row is "GRN {{n}} ·
 * {{field}}", the customer, the sentence of what replaced what, and "To check" or "Checked". A tap opens the GRN. It needs
 * the server: offline the screen says so, with no "Try again".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ListEmptyState } from '@/components/list';
import { ReportHeader } from '@/components/reports';
import { StatusTag } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { entryFieldLabel, replacedLineText } from '@/components/grn-details/replacedLineText';
import { NeedsConnectionLine } from '@/features/phone-copy/components/NeedsConnectionLine';
import { useNeedsConnection } from '@/features/phone-copy/useNeedsConnection';
import { getReplacedEntries, type ReplacedEntryRow } from '@/services/replacedEntriesService';
import { useThemedStyles } from '@/hooks/useTheme';
import { formatIdentifier, t as tr } from '@/i18n';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { todayInIST, toLocalISODate } from '@/utils/formatters';

/** The days the list asks for by default (Product PQ7). */
const DEFAULT_DAYS = 120;
const PAGE = 500;

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  period: { paddingHorizontal: layout.marginCompact, paddingTop: space.md, gap: space.sm },
  list: { paddingHorizontal: layout.marginCompact, paddingVertical: space.md, gap: space.sm },
  row: { gap: space.xs, padding: space.md, borderRadius: space.sm, backgroundColor: t.surface.card, borderWidth: 1, borderColor: t.border.divider },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-start' as const, gap: space.sm },
  title: { ...typography.subhead, fontWeight: '600' as const, color: t.text.primary, flexShrink: 1 },
  subtitle: { ...typography.footnote, color: t.text.secondary },
  centre: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: space.lg, gap: space.sm },
  message: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
});

function EntryRow({ entry }: { entry: ReplacedEntryRow }) {
  const styles = useThemedStyles(makeStyles);
  const checked = entry.checked_at !== null;
  const title = tr('offline.replacedList.rowTitle', { number: formatIdentifier(entry.gr_no), field: entryFieldLabel(entry, tr) });
  const sentence = replacedLineText(entry, tr);
  const tag = checked ? tr('offline.replacedList.checked') : tr('offline.replacedList.toCheck');
  const spokenTag = checked && entry.checked_by_name ? `${tag}, ${entry.checked_by_name}` : tag;
  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push(`/grn-details/${entry.grn_id}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={[title, entry.customer_name, sentence, spokenTag].filter(Boolean).join(', ')}
      testID={`replaced-entry-${entry.id}`}
    >
      <View style={styles.top}>
        <Text style={styles.title}>{title}</Text>
        <StatusTag
          status={checked ? 'neutral' : 'critical'}
          label={tag}
          accessibilityLabel={spokenTag}
          testID={`replaced-entry-tag-${entry.id}`}
        />
      </View>
      {entry.customer_name ? <Text style={styles.subtitle}>{entry.customer_name}</Text> : null}
      <Text style={styles.subtitle}>{sentence}</Text>
    </Pressable>
  );
}

export default function ReplacedEntriesScreen() {
  const styles = useThemedStyles(makeStyles);
  const needsConnection = useNeedsConnection();
  const today = useMemo(() => todayInIST(), []);
  const [from, setFrom] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), today.getDate() - DEFAULT_DAYS));
  const [to, setTo] = useState<Date>(today);
  // The answer for one period: it is "loading" while the answer held is for another period.
  const period = `${toLocalISODate(from)}|${toLocalISODate(to)}`;
  const [answer, setAnswer] = useState<{ period: string; rows: ReplacedEntryRow[] | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const settled = answer !== null && answer.period === period ? answer : null;
  const rows = settled?.rows ?? null;
  const failed = settled !== null && settled.rows === null;

  useEffect(() => {
    if (needsConnection) return undefined;
    let current = true;
    void getReplacedEntries(toLocalISODate(from), toLocalISODate(to), PAGE, 0).then(page => {
      if (current) setAnswer({ period, rows: page === null ? null : page.rows });
    });
    return () => {
      current = false;
    };
  }, [needsConnection, from, to, period, attempt]);

  return (
    <View style={styles.container} testID="replaced-entries-screen">
      <ReportHeader title={tr('offline.replacedList.title')} />
      {needsConnection ? (
        <View style={styles.centre}>
          <NeedsConnectionLine testID="replaced-entries-needs-connection" text={tr('components.offlineRead.screenNeedsConnection')} icon />
        </View>
      ) : (
        <>
          <View style={styles.period}>
            <DatePickerInput testID="replaced-entries-from" label={tr('filters.date.from')} value={from} onChange={setFrom} maximumDate={to} />
            <DatePickerInput testID="replaced-entries-to" label={tr('filters.date.to')} value={to} onChange={setTo} minimumDate={from} maximumDate={today} />
          </View>
          {settled === null ? (
            <View style={styles.centre} accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
              <ActivityIndicator />
            </View>
          ) : failed ? (
            <View style={styles.centre}>
              <Text style={styles.message}>{tr('common.checkConnection')}</Text>
              <Button type="secondary" onPress={() => { setAnswer(null); setAttempt(count => count + 1); }}>{tr('common.retry')}</Button>
            </View>
          ) : (
            <FlatList
              data={rows ?? []}
              keyExtractor={entry => entry.id}
              renderItem={({ item }) => <EntryRow entry={item} />}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <View testID="replaced-entries-empty">
                  <ListEmptyState activeFilterCount={0} emptyIcon="history" emptyTitle={tr('offline.replacedList.empty')} />
                </View>
              }
            />
          )}
        </>
      )}
    </View>
  );
}
