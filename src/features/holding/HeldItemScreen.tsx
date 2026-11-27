/**
 * A held item (WH-304, Design offline-capture.md 7.3, 7.4, 7.9, 7.10; contract 5.2, 5.3).
 *
 * For an administrator or supervisor (the default): the item as the server holds it, why, and the actions that fit: Reject
 * always, Accept only when accepting it as recorded would now succeed, Correct for every kind but photos. An item that follows
 * another waits: Accept and Correct are disabled under one line, and Reject stays enabled (DQ7). It needs the server.
 *
 * For the person who recorded it (`own=1`, from "Unsent items"): the same facts read from the phone's copy, with no actions and
 * working offline; a rejection is marked seen when it is opened, and then leaves the person's lists (Product, 2026-11-25).
 */
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { ConfirmInputDialog } from '@/components/ConfirmInputDialog';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { ReportEmptyState } from '@/components/reports/ReportEmptyState';
import { DetailSkeleton } from '@/components/skeletons/DetailSkeleton';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { ScreenNeedsConnection } from '@/features/phone-copy/components/ScreenNeedsConnection';
import { syncNow } from '@/features/phone-copy/syncEngine';
import { useCopyOffline } from '@/features/phone-copy/useCopyOffline';
import { isLotChangeBody } from '@/features/unsent/lotChangeKind';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { formatIdentifier, t as tr } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { queryKeys } from '@/lib/queryClient';
import { getGRNDetails } from '@/services/grn-detail-service';
import { layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatDate, formatLoadedAt, formatNumber } from '@/utils/formatters';
import { showToast } from '@/utils/toast';
import { QuickChangeSheet } from '@/features/quick-change/QuickChangeSheet';
import { acceptToast, acceptWithChanges, heldRouteId } from './heldForm';
import { correctedLotBody, heldLotTarget } from './heldLot';
import { decideHeldItem, getHeldItem, type HeldCurrent, type HeldItemDetail, type HeldListRow } from './holdingApi';
import { describeReason } from './heldReason';
import { heldCopyRows, markHeldSeen } from './heldRows';
import { heldFieldLabel, heldWhatText } from './heldWhat';
import { lineGroups, removedLinesNow, type ServerLine } from './heldEditLines';
import { isGrnEditBody } from '@/features/grn/offline-edit/grnEditChanges';
import { HeldPhotos } from './HeldPhotos';

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** Scrolling stops growing the bottom bar's buttons side by side from this system font scale: they stack, Accept on top. */
const STACK_FONT_SCALE = 1.5;

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  scroll: { paddingBottom: space.xl },
  hero: { backgroundColor: t.surface.card, paddingHorizontal: layout.marginCompact, paddingVertical: space.md, gap: space.xxs, marginBottom: space.sm },
  docType: { ...typography.footnote, color: t.text.secondary },
  title: { ...typography.title2, color: t.text.primary },
  facts: { marginTop: space.md, gap: space.sm },
  factLabel: { ...typography.footnote, color: t.text.secondary },
  factValue: { ...typography.subhead, color: t.text.primary },
  strip: { paddingHorizontal: layout.marginCompact, marginBottom: space.sm, gap: space.xs },
  hint: { ...typography.footnote, color: t.text.secondary },
  record: { backgroundColor: t.surface.card, paddingHorizontal: layout.marginCompact, paddingVertical: space.md, gap: space.xs },
  recordLine: { ...typography.body, color: t.text.primary },
  groupTitle: { ...typography.subhead, color: t.text.secondary },
  current: { ...typography.footnote, color: t.text.secondary, paddingHorizontal: layout.marginCompact, paddingTop: space.sm },
  bar: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
    gap: space.sm,
    backgroundColor: t.surface.card,
  },
  barRow: { flexDirection: 'row' as const },
  barStack: { flexDirection: 'column' as const },
  follows: { ...typography.footnote, color: t.text.secondary },
  grow: { flex: 1 },
});

/** The label of a changed field ("rack" reads "Rack", "customer_id" reads "Customer"). */
const fieldLabel = heldFieldLabel;

const valueText = (value: unknown): string | null => {
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return formatNumber(value);
  // A customer, sender, supervisor or item as the edit holds it: `{ id, name }`.
  if (isFields(value)) return textOf(value.name);
  return null;
};

/** One line per changed header field and lot field of a held edit (the form's own labels). */
function editLines(body: Fields): string[] {
  const lines: string[] = [];
  const fieldLine = (field: string, change: unknown) => {
    const to = isFields(change) ? valueText(change.to) : null;
    if (to !== null) lines.push(`${fieldLabel(field)} ${to}`);
  };
  if (isFields(body.header)) for (const [field, change] of Object.entries(body.header)) fieldLine(field, change);
  if (isFields(body.lots)) {
    for (const lot of Object.values(body.lots)) if (isFields(lot)) for (const [field, change] of Object.entries(lot)) fieldLine(field, change);
  }
  return lines;
}

/** The lines a held edit added and removed, each group under its title (Design 7.11d (a)). */
function LineGroups({ body, server, styles }: { body: unknown; server: readonly ServerLine[] | null; styles: ReturnType<typeof makeStyles> }) {
  const groups = lineGroups(body, server);
  return (
    <>
      {groups.map(group => (
        <View key={group.id} testID={`held-item-${group.id}`} style={styles.record}>
          <Text accessibilityRole="header" style={styles.groupTitle}>
            {group.title}
          </Text>
          {group.rows.map((rowText, index) => (
            <Text key={`${rowText}-${index}`} style={styles.recordLine}>
              {rowText}
            </Text>
          ))}
        </View>
      ))}
    </>
  );
}

/** The lines of the record a held item holds, as its details page would name them (identifiers are never shown as words). */
function recordLines(row: Pick<HeldListRow, 'kind' | 'reasonData'>, body: unknown): string[] {
  if (!isFields(body)) return [];
  if (row.kind === 'newDispatch' && isFields(body.args) && Array.isArray(body.args.p_dispatch_items)) {
    const names = new Map<string, string>();
    const data = isFields(row.reasonData) ? row.reasonData : {};
    for (const line of Array.isArray(data.lines) ? (data.lines as unknown[]) : []) {
      if (isFields(line) && typeof line.lot_id === 'string' && typeof line.item_name === 'string') names.set(line.lot_id, line.item_name);
    }
    return (body.args.p_dispatch_items as unknown[]).flatMap(line => {
      if (!isFields(line) || typeof line.gr_trl_id !== 'string' || typeof line.disp_qty !== 'number') return [];
      const name = names.get(line.gr_trl_id);
      return name ? [`${name} ${formatNumber(line.disp_qty)}`] : [];
    });
  }
  if (row.kind === 'grnEdit') return editLines(body);
  if (row.kind === 'lotChange' && isFields(body.changes)) {
    return Object.entries(body.changes).flatMap(([field, change]) => {
      const to = isFields(change) ? valueText(change.to) : null;
      return to === null ? [] : [`${fieldLabel(field)} ${to}`];
    });
  }
  return [];
}

/** "Now on the server: Rack D-4", several fields joined by ", " (Design 7.10); a field the server holds no value for is left out. */
function currentLine(current: readonly HeldCurrent[]): string | null {
  const shown = current.flatMap(entry => {
    const value = valueText(entry.current);
    return value === null ? [] : [{ field: fieldLabel(entry.field), value }];
  });
  const [first, ...more] = shown;
  if (!first) return null;
  return [tr('offline.holding.currentValue', first), ...more.map(entry => `${entry.field} ${entry.value}`)].join(', ');
}

interface FactsProps {
  row: HeldListRow;
  styles: ReturnType<typeof makeStyles>;
}

/** The hero: the kind of page, what the item is, the customer, and who recorded it, when and from which phone. */
function Hero({ row, styles }: FactsProps) {
  const recorded = Date.parse(row.recordedAt ?? '');
  const facts = [
    { key: 'customer', label: tr('offline.holding.facts.customer'), value: row.customerName },
    { key: 'recordedBy', label: tr('offline.holding.facts.recordedBy'), value: row.recordedByName },
    { key: 'recordedAt', label: tr('offline.holding.facts.recordedAt'), value: Number.isNaN(recorded) ? null : formatLoadedAt(recorded) },
    { key: 'phone', label: tr('offline.holding.facts.phone'), value: row.phone },
  ].flatMap(fact => (fact.value ? [{ ...fact, value: fact.value }] : []));
  return (
    <View style={styles.hero}>
      <View accessible accessibilityRole="header" accessibilityLabel={[tr('offline.holding.itemTitle'), heldWhatText(row.what)].join(', ')}>
        <Text style={styles.docType}>{tr('offline.holding.itemTitle')}</Text>
        <Text style={styles.title}>{heldWhatText(row.what)}</Text>
      </View>
      <View style={styles.facts}>
        {facts.map(fact => (
          <View key={fact.key} testID={`held-fact-${fact.key}`} accessible accessibilityLabel={`${fact.label}: ${fact.value}`}>
            <Text style={styles.factLabel}>{fact.label}</Text>
            <Text style={styles.factValue}>{fact.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The decided item's strip (Design 7.9 DQ8): who rejected it, when, and why. */
function rejectedText(row: HeldListRow): string | null {
  if (row.state !== 'rejected' || row.decidedByName === null) return null;
  return tr('offline.holding.rejectedStrip', { name: row.decidedByName, date: row.decidedAt === null ? '' : formatDate(row.decidedAt), reason: row.rejectReason ?? '' });
}

export function HeldItemScreen() {
  const { own } = useLocalSearchParams<{ id: string; own?: string }>();
  return own === '1' ? <OwnHeldItem /> : <ManagerHeldItem />;
}

/** The recorder's own view: read from the copy, no actions, no connection needed. */
function OwnHeldItem() {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const { id } = useLocalSearchParams<{ id: string }>();
  // The row as it was when it was opened: marking a rejection seen takes it out of the lists, not off this page.
  const [found] = useState(() => heldCopyRows().find(row => row.id === id && row.own));
  const rejected = found?.state === 'rejected';
  const markedFor = useRef<string | null>(null);
  React.useEffect(() => {
    if (found && rejected && markedFor.current !== found.id) {
      markedFor.current = found.id;
      void markHeldSeen(found.id);
    }
  }, [found, rejected]);

  const raw = found?.raw;
  const row: HeldListRow | null =
    found && raw
      ? {
          id: found.id,
          kind: found.kind,
          what: raw.what ?? null,
          customerName: textOf(raw.customer_name),
          recordedByName: textOf(raw.recorded_by_name),
          recordedAt: textOf(raw.recorded_at),
          phone: textOf(raw.phone),
          reason: textOf(raw.reason) ?? 'other',
          reasonData: raw.reason_data ?? null,
          state: found.state,
          follows: textOf(raw.follows),
          needsDecision: found.needsDecision,
          canAccept: false,
          decidedByName: textOf(raw.decided_by_name),
          decidedAt: textOf(raw.decided_at),
          rejectReason: textOf(raw.reject_reason),
          result: raw.result ?? null,
        }
      : null;

  return (
    <View testID="held-item-screen" style={styles.screen}>
      <Stack.Screen options={{ title: tr('offline.holding.title'), headerLeft: () => <HeaderBackButton /> }} />
      <EdgeToEdgeStatusBar barStyle={tokens.statusBarStyle} />
      {row === null ? (
        <ReportEmptyState icon="cloud-alert-outline" message={tr('common.couldNotLoad')} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Hero row={row} styles={styles} />
          <ItemReason row={row} styles={styles} follower={false} />
          <View testID="held-item-record" style={styles.record}>
            {recordLines(row, isFields(raw) ? raw.body : null).map(line => (
              <Text key={line} style={styles.recordLine}>
                {line}
              </Text>
            ))}
          </View>
          <LineGroups body={isFields(raw) ? raw.body : null} server={null} styles={styles} />
        </ScrollView>
      )}
    </View>
  );
}

/** The reason strip (Design 7.3 item 2) or, for a rejected item, the neutral strip with the rejecter's reason. */
function ItemReason({ row, styles, follower }: FactsProps & { follower: boolean }) {
  const rejected = rejectedText(row);
  if (rejected !== null) {
    return (
      <View testID="held-item-rejected-strip" style={styles.strip}>
        <InlineValidation variant="helper" message={rejected} />
      </View>
    );
  }
  if (row.state !== 'held') return null;
  const words = describeReason(row.reason, { kind: row.kind, what: row.what, customer: row.customerName, data: row.reasonData, followsWhat: null });
  return (
    <View style={styles.strip}>
      <View testID="held-item-reason">
        <InlineValidation variant="warning" message={words.sentence ?? words.tag} />
      </View>
      {follower ? null : (
        <Text testID="held-item-hint" style={styles.hint}>
          {words.hint}
        </Text>
      )}
    </View>
  );
}

/** What the person did, for the toast: the number of the document the item became or changed. */
function acceptedToast(item: HeldItemDetail, result: unknown): string {
  const done = isFields(result) ? result : {};
  const dispatch = textOf(done.disp_no);
  const grn = textOf(done.gr_no);
  const change = item.kind === 'lotChange' || item.kind === 'grnEdit' || item.kind === 'photos';
  const number = change ? (grn ?? dispatch) : (dispatch ?? grn);
  return change ? tr('offline.holding.acceptedChange', { number: formatIdentifier(number) }) : tr('offline.holding.accepted', { number: formatIdentifier(number) });
}

/** An administrator's or supervisor's view: the item from the server, and Reject, Correct and Accept. */
function ManagerHeldItem() {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const { fontScale } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const offline = useCopyOffline();
  const client = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.holding.detail(String(id)), queryFn: () => getHeldItem(String(id)), enabled: !offline, retry: false });
  const { refetch } = query;
  // The GRN of a held rack and mark change, for the Correct sheet to name the lot (Design 7.11b); no lot found gives the GRN alone.
  const lotBody = query.data && isLotChangeBody(query.data.body) ? query.data.body : null;
  // A held edit of a GRN reads the same GRN: its lines as the server holds them now (Design 7.11d (c)).
  const editBody = query.data?.kind === 'grnEdit' && isGrnEditBody(query.data.body) ? query.data.body : null;
  const grnId = lotBody?.grnId ?? editBody?.grnId ?? '';
  const grnQuery = useQuery({
    queryKey: queryKeys.grn.detail(grnId),
    queryFn: () => getGRNDetails(grnId),
    enabled: !offline && grnId !== '',
    retry: false,
  });
  const grnLines = grnQuery.data?.data?.grn.items;
  const serverLines: ServerLine[] | null = grnLines
    ? grnLines.map(line => ({ id: line.id, item_name: line.item_name, qty: line.qty, packaging: line.packaging, package_mark: line.package_mark }))
    : null;
  const removedNow = editBody ? removedLinesNow(editBody, serverLines) : [];
  const lotItemName = grnQuery.data?.data?.grn.items?.find(line => line.id === lotBody?.lotId)?.item_name ?? '';
  // One decision key for this visit: a double tap, or a repeat after a lost answer, is one decision (the server keeps its first answer).
  const decisionKey = useRef(Crypto.randomUUID());
  const deciding = useRef(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  // A held rack and mark change is corrected in the quick-change sheet (Design 7.9 DQ4); its refusal is told on the sheet.
  const [correcting, setCorrecting] = useState(false);
  const [sheetRefusal, setSheetRefusal] = useState<string | null>(null);

  const finish = useCallback(async () => {
    await client.invalidateQueries({ queryKey: queryKeys.holding.all });
    // What was decided changes the numbers and stock the copy holds: ask for a sync (contract 5.2).
    void syncNow('after-send');
    router.back();
  }, [client]);

  const decide = useCallback(
    async (item: HeldItemDetail, action: 'accept' | 'reject', rejectReason?: string) => {
      if (deciding.current) return;
      deciding.current = true;
      setBusy(true);
      try {
        const outcome =
          action === 'reject'
            ? await decideHeldItem({ id: item.id, action: 'reject', decisionKey: decisionKey.current, reason: rejectReason ?? '' })
            : await decideHeldItem({ id: item.id, action: 'accept', decisionKey: decisionKey.current });
        if (outcome.kind === 'done') {
          if (outcome.state === 'rejected') {
            showToast(tr('offline.holding.rejected'));
          } else {
            const shown = acceptToast(outcome.result, acceptedToast(item, outcome.result));
            if (shown.durationMs !== undefined) showToast(shown.text, { durationMs: shown.durationMs });
            else showToast(shown.text);
          }
          await finish();
        } else if (outcome.kind === 'alreadyDecided') {
          const key: TranslationKey = outcome.state === 'rejected' ? 'offline.holding.alreadyRejected' : 'offline.holding.alreadyAccepted';
          showToast(tr(key, { name: outcome.decidedByName ?? '' }));
          await finish();
        } else if (outcome.kind === 'refused') {
          // The save refused it again: the item stays held with its new reason (the server stored it); read it again.
          setRejecting(false);
          await refetch();
        } else {
          showToast(tr('common.somethingWentWrong'));
        }
      } finally {
        deciding.current = false;
        setBusy(false);
      }
    },
    [finish, refetch]
  );

  const correctLot = useCallback(
    async (item: HeldItemDetail, values: { rack?: string | null; package_mark?: string | null }) => {
      if (deciding.current || !isLotChangeBody(item.body)) return;
      deciding.current = true;
      setBusy(true);
      try {
        const decided = await acceptWithChanges(item, correctedLotBody(item.body, values), decisionKey.current);
        if (decided.kind === 'accepted' || decided.kind === 'alreadyDecided') {
          if (decided.kind === 'accepted' && decided.durationMs !== undefined) showToast(decided.toast, { durationMs: decided.durationMs });
          else showToast(decided.toast);
          setCorrecting(false);
          await finish();
        } else if (decided.kind === 'refused') {
          setSheetRefusal(decided.message);
          await refetch();
        } else {
          setSheetRefusal(tr('common.somethingWentWrong'));
        }
      } finally {
        deciding.current = false;
        setBusy(false);
      }
    },
    [finish, refetch]
  );

  const correct = (item: HeldItemDetail) => {
    // A held edit of a GRN opens the same wizard on the held item's id; its layout reads the GRN and puts the held changes on top.
    if (item.kind === 'newGrn' || item.kind === 'grnEdit') router.push({ pathname: '/grn-edit/[id]/step1', params: { id: heldRouteId(item.id) } });
    else if (item.kind === 'lotChange') {
      setSheetRefusal(null);
      setCorrecting(true);
    }
  };

  const item = query.data;
  let loaded = false;
  let body: React.ReactNode;
  if (offline) {
    body = <ScreenNeedsConnection testID="held-item-needs-connection" />;
  } else if (query.isPending) {
    body = <DetailSkeleton />;
  } else if (query.isError || !item) {
    body = <ReportEmptyState icon="cloud-alert-outline" tone="error" message={tr('common.couldNotLoad')} actionLabel={tr('common.retry')} onAction={() => void refetch()} />;
  } else {
    loaded = true;
    const open = item.state === 'held' && item.needsDecision;
    const waiting = open && !item.canAccept;
    const showAccept = open && (item.acceptPossible || waiting);
    // Correct opens the kind's own form where this app has one with a held mode: a new GRN, an edit of a GRN, and a rack and mark change.
    const showCorrect = open && (item.kind === 'newGrn' || item.kind === 'grnEdit' || item.kind === 'lotChange');
    const lotTarget = correcting ? heldLotTarget(item, lotItemName) : null;
    const stacked = fontScale >= STACK_FONT_SCALE;
    const current = currentLine(item.current);
    const words = describeReason(item.reason, { kind: item.kind, what: item.what, customer: item.customerName, data: item.reasonData, followsWhat: null });
    body = (
      <>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Hero row={item} styles={styles} />
          <ItemReason row={item} styles={styles} follower={waiting} />
          <View testID="held-item-record" style={styles.record}>
            {recordLines(item, item.acceptedBody ?? item.body).map(line => (
              <Text key={line} style={styles.recordLine}>
                {line}
              </Text>
            ))}
          </View>
          <LineGroups body={item.acceptedBody ?? item.body} server={serverLines} styles={styles} />
          <HeldPhotos item={item} />
        </ScrollView>
        {current !== null ? (
          <Text testID="held-item-current" style={styles.current}>
            {current}
          </Text>
        ) : null}
        {removedNow.map((text, index) => (
          <Text key={`${text}-${index}`} testID="held-item-line-current" style={styles.current}>
            {text}
          </Text>
        ))}
        {open ? (
          <View style={styles.bar}>
            {waiting ? (
              <Text testID="held-item-follows" style={styles.follows}>
                {words.reason === 'followsHeld' ? words.hint : tr('offline.holding.hint.followsHeld')}
              </Text>
            ) : null}
            <View style={stacked ? styles.barStack : styles.barRow}>
              {/* Accept is drawn first when stacked, so the drawing, the reading order and the focus order agree. */}
              {showAccept && stacked ? (
                <Button testID="held-item-accept" type="primary" size="fullWidth" disabled={waiting || busy} loading={busy} onPress={() => void decide(item, 'accept')}>
                  {tr('offline.holding.accept')}
                </Button>
              ) : null}
              <Button testID="held-item-reject" type="secondary" variant="negative" size={stacked ? 'fullWidth' : 'auto'} disabled={busy} onPress={() => setRejecting(true)}>
                {tr('offline.holding.reject')}
              </Button>
              {showCorrect ? (
                <Button testID="held-item-correct" type="secondary" size={stacked ? 'fullWidth' : 'auto'} disabled={waiting || busy} onPress={() => correct(item)}>
                  {tr('offline.holding.correct')}
                </Button>
              ) : null}
              {showAccept && !stacked ? (
                <Button testID="held-item-accept" type="primary" size="auto" disabled={waiting || busy} loading={busy} onPress={() => void decide(item, 'accept')}>
                  {tr('offline.holding.accept')}
                </Button>
              ) : null}
            </View>
          </View>
        ) : null}
        {lotTarget ? (
          <QuickChangeSheet
            target={lotTarget}
            saving={busy}
            refusal={sheetRefusal}
            onClearRefusal={() => setSheetRefusal(null)}
            onSave={values => void correctLot(item, values)}
            onClose={() => setCorrecting(false)}
            saveLabel={tr('offline.holding.acceptCorrected')}
          />
        ) : null}
        <ConfirmInputDialog
          visible={rejecting}
          testID="held-reject-dialog"
          title={tr('offline.holding.rejectTitle')}
          message={tr('offline.holding.rejectReason')}
          confirmText={tr('offline.holding.reject')}
          cancelText={tr('common.cancel')}
          variant="danger"
          busy={busy}
          confirmDisabled={reason.trim() === ''}
          onCancel={() => setRejecting(false)}
          onConfirm={() => void decide(item, 'reject', reason.trim())}
          field={{
            testID: 'held-reject-reason',
            value: reason,
            onChangeText: setReason,
            accessibilityLabel: tr('offline.holding.rejectReason'),
            multiline: true,
            maxLength: 500,
          }}
        />
      </>
    );
  }

  return (
    <View testID={loaded ? 'held-item-screen' : undefined} style={styles.screen}>
      <Stack.Screen options={{ title: tr('offline.holding.title'), headerLeft: () => <HeaderBackButton /> }} />
      <EdgeToEdgeStatusBar barStyle={tokens.statusBarStyle} />
      {body}
    </View>
  );
}

export default HeldItemScreen;
