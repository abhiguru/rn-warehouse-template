/**
 * "Unsent items" (WH-301, Design Part 4.2; contract section 10): the signed-in person's work saved on this phone and not
 * sent yet, what was sent today, when something was last sent, and one button, Send now. Another person's items are never
 * listed. Nothing here calls the server except the send itself.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { holdingOn, moveOtherPersonToHolding } from '@/features/holding/handOver';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { askAlert } from '@/utils/alert';
import { formatLoadedAt } from '@/utils/formatters';
import { showToast } from '@/utils/toast';
import { createLogger, loggableError } from '@/utils/logger';
import { endFormDraft } from './formDrafts';
import { sendNow } from './sendEngine';
import { InfoStrip } from './UnsentMarkers';
import { requestContinue } from './useFormDraft';
import { deleteItem, otherPeopleBySubject } from './unsentQueue';
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
  unfinished: 'offline.unsent.sectionUnfinished',
  unsent: 'offline.unsent.sectionUnsent',
  held: 'offline.unsent.sectionHeld',
  sent: 'offline.unsent.sectionSent',
} as const;

function entriesOf(rows: UnsentListRow[]): Entry[] {
  const out: Entry[] = [];
  for (const section of ['unfinished', 'unsent', 'held', 'sent'] as const) {
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
  const { loaded, rows, lastSentAt, others } = useUnsentList();
  const { isAdmin } = usePermissions();
  const [sending, setSending] = useState(false);
  const [moving, setMoving] = useState(false);
  // The subject each other person's items are kept under: an administrator moves them by it (Design 4.2, 4.3).
  const [subjects, setSubjects] = useState<{ subject: string; name: string }[]>([]);
  useEffect(() => {
    let live = true;
    void otherPeopleBySubject().then(
      people => {
        if (live) setSubjects(people);
      },
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [others]);
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

  const move = useCallback(
    async (name: string) => {
      const subject = subjects.find(person => person.name === name)?.subject;
      if (subject === undefined || moving) return;
      const answer = await askAlert(
        tr('offline.moveHolding.title', { name }),
        tr('offline.moveHolding.message'),
        [
          { text: tr('common.cancel'), style: 'cancel', value: 'keep' as const },
          { text: tr('offline.unsent.moveToHolding'), value: 'move' as const },
        ],
        'keep' as const
      );
      if (answer !== 'move') return;
      setMoving(true);
      try {
        const outcome = await moveOtherPersonToHolding(subject);
        if (outcome.failed !== undefined) showToast(tr('common.somethingWentWrong'));
      } finally {
        setMoving(false);
      }
    },
    [subjects, moving]
  );

  const open = useCallback((row: UnsentListRow) => {
    // An unfinished form opens where it was left, without asking again.
    if (row.form !== null) {
      requestContinue(row.form.kind, row.form.grnId);
      if (row.form.kind === 'grn') router.push('/grn-form/step1');
      else if (row.form.kind === 'dispatch') router.push('/dispatch-form/step1');
      else router.push(`/grn-edit/${row.form.grnId ?? ''}/step1`);
      return;
    }
    // A held or rejected item: its page, read-only for the person who recorded it (Design 7.4).
    if (row.heldId !== undefined && row.tag !== 'accepted') {
      router.push({ pathname: '/held-item/[id]', params: { id: row.heldId, own: '1' } });
      return;
    }
    if (row.target.grnId !== undefined) router.push(`/grn-details/${row.target.grnId}`);
    else if (row.target.dispatchId !== undefined) router.push(`/dispatch-details/${row.target.dispatchId}`);
  }, []);

  const remove = useCallback(async (row: UnsentListRow) => {
    if (row.form !== null) {
      // A form asks today's discard question (Design 4.3).
      const form = row.form;
      const title = form.kind === 'grn' ? tr('components.steps.discardFor.grn') : form.kind === 'dispatch' ? tr('components.steps.discardFor.dispatch') : tr('common.discardChangesTitle');
      const discard = await askAlert<'keep' | 'discard'>(
        title,
        form.kind === 'grnEdit' ? tr('common.discardChangesMessage') : tr('grn.form.discardMessage'),
        [
          { text: tr('common.cancel'), style: 'cancel', value: 'keep' },
          { text: tr('common.discard'), style: 'destructive', value: 'discard' },
        ],
        'keep'
      );
      if (discard === 'discard') await endFormDraft(form.kind, form.grnId);
      return;
    }
    const answer = await askAlert(
      tr('offline.delete.title'),
      // An item the server refused and that could not be passed to a supervisor says so, so it can be noted down first (Design 7.11).
      [
        tr('offline.delete.message', { what: row.title, customer: row.customer ?? '', time: formatLoadedAt(row.recordedAt) }),
        ...(row.tag === 'notPassedOn' && row.notPassedOnReason !== undefined ? [tr('offline.delete.notPassedOn', { reason: row.notPassedOnReason })] : []),
      ].join(' '),
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
      {/* Someone else's items on this phone: only their name and how many. Not listed, not sent, not deleted here (spec step 27). */}
      {others.map(person => (
        <React.Fragment key={person.name}>
          <InfoStrip testID="unsent-other-person" text={tr('offline.unsent.otherPerson', { count: person.count, name: person.name })} />
          {isAdmin && holdingOn() ? (
            <>
              <Button
                testID="unsent-move-to-holding"
                type="secondary"
                size="fullWidth"
                disabled={offline || moving}
                loading={moving}
                onPress={() => void move(person.name)}
              >
                {tr('offline.unsent.moveToHolding')}
              </Button>
              {offline ? (
                <Text testID="unsent-move-needs-connection" style={styles.reason}>
                  {tr('components.offlineRead.needsConnection')}
                </Text>
              ) : null}
            </>
          ) : null}
        </React.Fragment>
      ))}
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
