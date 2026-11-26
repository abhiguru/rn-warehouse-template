/**
 * What a screen draws for work this phone has not sent (WH-301, Design 2.2 to 2.4): the footnote on a row, the strip at the
 * top of a details page, and the deduction lines under a lot's stock. They read the overlay (`unsentOverlay.ts`) and draw
 * again when it changes.
 */
import React, { useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { subscribeSyncRunEnd } from '@/features/phone-copy/syncEngine';
import { getUnsentOverlay, type UnsentOverlay } from '@/features/phone-copy/unsentOverlay';
import { subscribeUnsent } from './unsentStore';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, type TranslationKey } from '@/i18n';
import { iconSize, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

// The overlay changes when the unsent-work store does and when a sync run ends (a sent item's values then go). Components
// subscribe to a version number, not to the overlay: the overlay is read when they draw.
let overlayVersion = 0;
const overlayListeners = new Set<() => void>();
let watching: (() => void)[] = [];

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

// What an overlay that does not say anything about markers means: no marker, no changed field, no other person's bags.
const WITHOUT_MARKERS: Pick<UnsentOverlay, 'marker' | 'changedFields' | 'lessOthersUnsent'> = {
  marker: () => null,
  changedFields: () => [],
  lessOthersUnsent: () => 0,
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
});

/** Design 2.2: a footnote at the bottom of a card or row, icon and words, never a tag. Nothing when there is no marker. */
export function UnsentFootnote({ marker, testID, inline = false }: { marker: Marker | null; testID: string; inline?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  if (marker === null) return null;
  return (
    <View style={[styles.footnote, inline && styles.footnoteInline]} testID={testID}>
      <Icon name="cloud-upload-outline" size={iconSize.sm} color={tokens.status.informative.text} importantForAccessibility="no" />
      <Text style={styles.footnoteText}>{markerText(marker)}</Text>
    </View>
  );
}

/**
 * Design 2.3: the strip under a details page's header. `fields` are the locale keys of the labels of what was changed,
 * joined by ", ". Not a live region as a whole, but its change from "not sent" to "sending" to gone is announced.
 */
export function UnsentStrip({ marker, fields, testID }: { marker: Marker | null; fields: string[]; testID: string }) {
  if (marker === null) return null;
  const text =
    marker === 'sending'
      ? tr('components.offlineRead.changesSending')
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
  return <UnsentStrip marker={marker} fields={overlay.changedFields(kind, id)} testID={testID} />;
}

/** A lot row's unsent footnote (Design 2.2) and its deduction lines (Design 2.4), under the lot's item name. */
export function UnsentLotLines({ lotId }: { lotId: string }) {
  const overlay = useUnsentOverlay();
  return (
    <>
      <UnsentFootnote inline marker={overlay.marker('lot', lotId)} testID={`grn-lot-unsent-${lotId}`} />
      <DeductionLines lotId={lotId} />
    </>
  );
}

/** Design 2.4: one line per deduction under a lot's stock, only above zero. */
export function DeductionLines({ lotId }: { lotId: string }) {
  const styles = useThemedStyles(makeStyles);
  const overlay = useUnsentOverlay();
  const lessUnsent = overlay.lessUnsent(lotId);
  const lessHeld = overlay.lessHeld(lotId);
  const lessOthers = overlay.lessOthersUnsent?.(lotId) ?? 0;
  return (
    <>
      {lessUnsent > 0 ? (
        <Text style={styles.line} testID={`lot-less-unsent-${lotId}`}>
          {tr('components.offlineRead.lessNotSent', { count: lessUnsent })}
        </Text>
      ) : null}
      {lessOthers > 0 ? (
        <Text style={styles.line} testID={`lot-less-others-${lotId}`}>
          {tr('components.offlineRead.lessOtherPerson', { count: lessOthers })}
        </Text>
      ) : null}
      {lessHeld > 0 ? (
        <Text style={styles.line} testID={`lot-less-held-${lotId}`}>
          {tr('components.offlineRead.lessHeld', { count: lessHeld })}
        </Text>
      ) : null}
    </>
  );
}
