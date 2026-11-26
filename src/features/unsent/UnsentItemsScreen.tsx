/**
 * "Unsent items" (WH-301, Design Part 4.2; contract section 10): the signed-in person's work saved on this phone and not
 * sent yet, what was sent today, when something was last sent, and one button, Send now. Another person's items are never
 * listed. Nothing here calls the server except the send itself.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { askAlert } from '@/utils/alert';
import { formatLoadedAt } from '@/utils/formatters';
import { createLogger, loggableError } from '@/utils/logger';
import { sendNow } from './sendEngine';
import { deleteItem } from './unsentQueue';
import { useUnsentList, type UnsentListRow } from './unsentList';
import { UnsentRow } from './UnsentRow';

const logger = createLogger('[unsent-screen]');

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  summary: { backgroundColor: t.surface.card, padding: space.md, gap: space.sm, marginBottom: space.sm },
  lastSent: { ...typography.footnote, color: t.text.secondary },
  reason: { ...typography.footnote, color: t.text.secondary },
  emptyFill: { minHeight: 280 },
});

type Entry = { type: 'header'; key: string; testID: string; title: string; count: number } | { type: 'row'; key: string; row: UnsentListRow; divider: boolean };

const SECTION_TITLES = {
  unsent: 'offline.unsent.sectionUnsent',
  held: 'offline.unsent.sectionHeld',
  sent: 'offline.unsent.sectionSent',
} as const;

function entriesOf(rows: UnsentListRow[]): Entry[] {
  const out: Entry[] = [];
  for (const section of ['unsent', 'held', 'sent'] as const) {
    const own = rows.filter(row => row.section === section);
    if (own.length === 0) continue;
    out.push({
      type: 'header',
      key: `header-${section}`,
      testID: `unsent-section-${section}`,
      title: tr(SECTION_TITLES[section]),
      count: own.length,
    });
    own.forEach((row, index) => out.push({ type: 'row', key: row.id, row, divider: index < own.length - 1 }));
  }
  return out;
}

export function UnsentItemsScreen() {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const offline = useIsOffline();
  const { loaded, rows, lastSentAt } = useUnsentList();
  const [sending, setSending] = useState(false);
  const entries = useMemo(() => entriesOf(rows), [rows]);
  const anyToSend = rows.some(row => row.section === 'unsent');

  const send = useCallback(async () => {
    // A second tap while a pass runs does nothing.
    if (sending) return;
    setSending(true);
    try {
      await sendNow('send-now');
    } finally {
      setSending(false);
    }
  }, [sending]);

  const open = useCallback((row: UnsentListRow) => {
    if (row.target.grnId !== undefined) router.push(`/grn-details/${row.target.grnId}`);
    else if (row.target.dispatchId !== undefined) router.push(`/dispatch-details/${row.target.dispatchId}`);
  }, []);

  const remove = useCallback(async (row: UnsentListRow) => {
    const answer = await askAlert(
      tr('offline.delete.title'),
      tr('offline.delete.message', { what: row.title, customer: row.customer ?? '', time: formatLoadedAt(row.recordedAt) }),
      [
        { text: tr('offline.delete.keep'), style: 'cancel', value: 'keep' as const },
        { text: tr('offline.delete.confirm'), style: 'destructive', value: 'delete' as const },
      ],
      'keep' as const
    );
    if (answer !== 'delete') return;
    try {
      await deleteItem(row.id);
    } catch (error) {
      logger.warn('An unsent item could not be deleted', loggableError(error));
    }
  }, []);

  const summary = (
    <View style={styles.summary}>
      <Text testID="unsent-last-sent" style={styles.lastSent}>
        {lastSentAt === null ? tr('offline.unsent.neverSent') : tr('offline.unsent.lastSent', { time: formatLoadedAt(lastSentAt) })}
      </Text>
      {anyToSend ? (
        <>
          <Button
            testID="unsent-send-now"
            size="fullWidth"
            disabled={offline || sending}
            loading={sending}
            loadingText={tr('offline.unsent.sendingNow')}
            onPress={() => void send()}
          >
            {tr('offline.unsent.sendNow')}
          </Button>
          {offline ? (
            <Text testID="unsent-send-now-needs-connection" style={styles.reason}>
              {tr('components.offlineRead.needsConnection')}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <View testID="unsent-screen" style={styles.screen}>
      <Stack.Screen options={{ title: tr('offline.unsent.title'), headerLeft: () => <HeaderBackButton /> }} />
      <EdgeToEdgeStatusBar barStyle={tokens.statusBarStyle} />
      <FlashList
        data={entries}
        keyExtractor={entry => entry.key}
        getItemType={entry => entry.type}
        ListHeaderComponent={summary}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.emptyFill}>
              <ListEmptyState
                testID="unsent-empty"
                activeFilterCount={0}
                emptyIcon="cloud-check-outline"
                emptyTitle={tr('offline.unsent.emptyTitle')}
                emptySubtitle={tr('offline.unsent.emptyText')}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <SectionHeader testID={item.testID} title={item.title} count={item.count} />
          ) : (
            <UnsentRow row={item.row} divider={item.divider} onOpen={open} onDelete={row => void remove(row)} />
          )
        }
      />
    </View>
  );
}

export default UnsentItemsScreen;
