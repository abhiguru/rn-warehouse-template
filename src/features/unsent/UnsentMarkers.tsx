/**
 * What a screen draws for work this phone has not sent (WH-301, Design 2.2 to 2.4): the footnote on a row, the strip at the
 * top of a details page, and the deduction lines under a lot's stock. They read the overlay (`unsentOverlay.ts`) and draw
 * again when it changes.
 */
import React, { useEffect, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { subscribeSyncRunEnd } from '@/features/phone-copy/syncEngine';
import { useCopyOffline } from '@/features/phone-copy/useCopyOffline';
import { getUnsentOverlay, type UnsentOverlay } from '@/features/phone-copy/unsentOverlay';
import { currentUnsentScope, loadedUnsentRows, subscribeUnsent } from './unsentStore';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, type TranslationKey } from '@/i18n';
import { iconSize, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';

// The overlay changes when the unsent-work store does and when a sync run ends (a sent item's values then go). Components
// subscribe to a version number, not to the overlay: the overlay is read when they draw.
let overlayVersion = 0;
const overlayListeners = new Set<() => void>();
let watching: (() => void)[] = [];
registerSessionScoped('unsent-markers-version', () => {
  overlayVersion += 1;
  for (const each of [...overlayListeners]) each();
});

function subscribeOverlayVersion(listener: () => void): () => void {
  overlayListeners.add(listener);
  if (watching.length === 0) {
    const bump = () => {
      overlayVersion += 1;
      for (const each of [...overlayListeners]) each();
    };
    watching = [subscribeUnsent(bump), subscribeSyncRunEnd(bump)];
  }
  return () => {
    overlayListeners.delete(listener);
    if (overlayListeners.size === 0) {
      for (const stop of watching) stop();
      watching = [];
    }
  };
}

const readOverlayVersion = (): number => overlayVersion;

// What an overlay that does not say anything about markers means: no marker, no changed field.
const WITHOUT_MARKERS: Pick<UnsentOverlay, 'marker' | 'changedFields' | 'newDocuments'> = {
  newDocuments: () => [],
  marker: () => null,
  changedFields: () => [],
};

/** The overlay as it is now, drawn again when it changes. */
export function useUnsentOverlay(): UnsentOverlay {
  useSyncExternalStore(subscribeOverlayVersion, readOverlayVersion, readOverlayVersion);
  return { ...WITHOUT_MARKERS, ...getUnsentOverlay() };
}

type Marker = 'notSent' | 'sending';

/** The words of a row's footnote (also read at the end of the row's spoken label, Design 2.7). */
export const markerText = (marker: Marker): string => (marker === 'sending' ? tr('components.offlineRead.sending') : tr('components.offlineRead.notSent'));

const makeStyles = (t: ThemeTokens) => ({
  footnote: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs, paddingHorizontal: space.lg, paddingBottom: space.sm },
  footnoteInline: { paddingHorizontal: 0, paddingBottom: 0 },
  footnoteText: { ...typography.footnote, color: t.text.secondary, flexShrink: 1 },
  strip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    padding: space.md,
    marginHorizontal: space.lg,
    marginVertical: space.sm,
    borderRadius: radius.button,
    borderWidth: 1,
    backgroundColor: t.status.informative.background,
    borderColor: t.status.informative.border,
  },
  stripText: { ...typography.footnote, color: t.status.informative.text, flexShrink: 1 },
  line: { ...typography.footnote, color: t.text.secondary },
  lineInset: { paddingHorizontal: space.lg },
});

/** Design 2.2: a footnote at the bottom of a card or row, icon and words, never a tag. Nothing when there is no marker. */
export function UnsentFootnote({ marker, testID, inline = false, text }: { marker: Marker | null; testID: string; inline?: boolean; text?: string }) {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  if (marker === null) return null;
  return (
    <View style={[styles.footnote, inline && styles.footnoteInline]} testID={testID}>
      <Icon name="cloud-upload-outline" size={iconSize.sm} color={tokens.status.informative.text} importantForAccessibility="no" />
      <Text style={styles.footnoteText}>{text ?? markerText(marker)}</Text>
    </View>
  );
}

/**
 * Design 2.3: the strip under a details page's header. `fields` are the locale keys of the labels of what was changed,
 * joined by ", ". Not a live region as a whole, but its change from "not sent" to "sending" to gone is announced.
 */
export function UnsentStrip({ marker, fields, testID, wholeDocument = false }: { marker: Marker | null; fields: string[]; testID: string; wholeDocument?: boolean }) {
  if (marker === null) return null;
  // A document that exists only on this phone is new as a whole (WH-161, Design 10.3): its own words, not the changed fields'.
  const text =
    marker === 'sending'
      ? tr('components.offlineRead.changesSending')
      : wholeDocument
        ? tr('offline.offlineNew.docNotSent')
        : tr('components.offlineRead.changesNotSent', { fields: fields.map(field => tr(field as TranslationKey)).join(', ') });
  return <InfoStrip text={text} testID={testID} />;
}

/** The informative message strip (Design 2.3, 4.2 item 3): icon and words in `status.informative`. */
export function InfoStrip({ text, testID }: { text: string; testID: string }) {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  return (
    <View style={styles.strip} testID={testID} accessible accessibilityLabel={text} accessibilityLiveRegion="polite">
      <Icon name="cloud-upload-outline" size={iconSize.sm} color={tokens.status.informative.text} importantForAccessibility="no" />
      <Text style={styles.stripText}>{text}</Text>
    </View>
  );
}

/**
 * The strip of a GRN's or dispatch's details page (Design 2.3), read from the overlay by the record's id. For a GRN the
 * lots count too: a changed lot is a change the receipt carries.
 */
export function UnsentDetailsStrip({ kind, id, lotIds = [], testID }: { kind: 'grn' | 'dispatch'; id: string; lotIds?: string[]; testID: string }) {
  const overlay = useUnsentOverlay();
  const marker = overlay.marker(kind, id) ?? lotIds.map(lotId => overlay.marker('lot', lotId)).find(found => found !== null) ?? null;
  const wholeDocument = overlay.newDocuments(kind).some(doc => doc.localId === id);
  return <UnsentStrip marker={marker} fields={overlay.changedFields(kind, id)} testID={testID} wholeDocument={wholeDocument} />;
}

/** A lot row's unsent footnote (Design 2.2), under the lot's item name. No deduction lines since WH-381. */
export function UnsentLotLines({ lotId, removed = false }: { lotId: string; removed?: boolean }) {
  const overlay = useUnsentOverlay();
  return (
    <>
      {/* A line the person removed and has not sent: "Removed, not sent yet" in place of "Not sent yet" (Design 6.x DQ4). */}
      <UnsentFootnote inline marker={overlay.marker('lot', lotId)} testID={`grn-lot-unsent-${lotId}`} {...(removed ? { text: tr('offline.lineRemovedNotSent') } : {})} />
    </>
  );
}

/**
 * Design 10.7 (PQ3): the line directly under a total that counts bags of GRNs not sent yet. Nothing when there are none. The
 * screen puts the same words at the end of the total's spoken label (`includesUnsentText`).
 */
export const includesUnsentText = (count: number | undefined): string | null =>
  count !== undefined && count > 0 ? tr('offline.offlineNew.includesUnsent', { count }) : null;

export function IncludesUnsentLine({ count, testID, inset = false }: { count: number | undefined; testID: string; inset?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const text = includesUnsentText(count);
  if (text === null) return null;
  return (
    <Text style={[styles.line, inset && styles.lineInset]} testID={`${testID}-includes-unsent`}>
      {text}
    </Text>
  );
}

/**
 * Design 10.7 (PQ1): in place of the rates section's body when the rates are not on the phone. One footnote line with a
 * cloud-off icon; it never blocks Next or Create GRN.
 */
export function RatesCheckedWhenSent() {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  return (
    <View style={styles.footnote} testID="grn-review-rates-checked-when-sent">
      <Icon name="cloud-off-outline" size={iconSize.sm} color={tokens.text.secondary} importantForAccessibility="no" />
      <Text style={styles.footnoteText}>{tr('offline.offlineNew.ratesCheckedWhenSent')}</Text>
    </View>
  );
}

/**
 * Print, PDF, Share, Edit and Delete of a document that exists only on this phone wait for the server (WH-161, Design 10.3 and
 * 10.6 DQ2): `isNew` disables them; `note` is the line that says why while the phone is reachable ("Available once this is sent").
 * Offline `note` is undefined and the screen's own "Needs a connection" stays.
 */
export function useNewDocumentActions(kind: 'grn' | 'dispatch', id: string): { isNew: boolean; note: string | undefined } {
  const overlay = useUnsentOverlay();
  const offline = useCopyOffline();
  const isNew = overlay.newDocuments(kind).some(doc => doc.localId === id && doc.state !== 'sent');
  return { isNew, note: isNew && !offline ? tr('offline.offlineNew.onceSent') : undefined };
}

/** "<label>, available once this is sent": the spoken label of a disabled action while the phone is reachable. */
export const onceSentLabel = (label: string, note: string): string => `${label}, ${note.charAt(0).toLowerCase()}${note.slice(1)}`;

const parseJsonObject = (text: string | null): Record<string, unknown> | null => {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** The server id assigned to a sent new record whose local id is `localId`, even if a sync already removed it from the overlay. */
export function sentServerIdOf(kind: 'grn' | 'dispatch', localId: string, overlay: UnsentOverlay): string | null {
  const fromOverlay = overlay.newDocuments(kind).find(doc => doc.localId === localId)?.serverId;
  if (typeof fromOverlay === 'string' && fromOverlay.length > 0) return fromOverlay;
  const scope = currentUnsentScope();
  if (scope === null) return null;
  // Only a new GRN is queued on the phone (WH-381); a dispatch has no local record to follow.
  if (kind !== 'grn') return null;
  for (const row of loadedUnsentRows()) {
    if (row.scope !== scope || row.kind !== 'newGrn' || row.state !== 'sent') continue;
    const target = parseJsonObject(row.target_ref);
    if (target?.grnId !== localId) continue;
    const result = parseJsonObject(row.result);
    const serverId = result?.grn_id;
    if (typeof serverId === 'string' && serverId.length > 0) return serverId;
  }
  return null;
}

/**
 * WH-161 (§6): an open details page on a local id follows the record to its server id once sent.
 */
export function useFollowSentRoute(kind: 'grn' | 'dispatch', id: string): void {
  const overlay = useUnsentOverlay();
  const serverId = sentServerIdOf(kind, id, overlay);
  useEffect(() => {
    if (serverId && serverId !== id) {
      router.replace(kind === 'grn' ? `/grn-details/${serverId}` : `/dispatch-details/${serverId}`);
    }
  }, [kind, id, serverId]);
}
