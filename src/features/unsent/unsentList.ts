/**
 * What the "Unsent items" screen lists (WH-301, contract section 10; Design 4.2): the signed-in person's own items, the
 * ones not sent yet oldest first and the ones sent today newest first, each with the words of its row. Another person's
 * items are never listed (spec step 27).
 */
import { useEffect, useState } from 'react';
import { createLogger, loggableError } from '@/utils/logger';
import { t as tr } from '@/i18n';
import { DEPENDS_ON_REFUSED } from './sendEngine';
import { listItems, photosOfItem, type UnsentRowView } from './unsentQueue';
import { getLastSentAt, type ItemState } from './unsentRows';
import { subscribeUnsent } from './unsentStore';

const logger = createLogger('[unsent-list]');

export interface UnsentListRow {
  id: string;
  state: ItemState;
  section: 'unsent' | 'held' | 'sent';
  /** The row's title in the person's language, and the customer. */
  title: string;
  customer: string | null;
  recordedAt: number;
  /** The server's number once a record is sent ("Sent · GRN 312"), 0-9 as an identifier. */
  sentNumber: string | null;
  /** A photo file of this item is gone from the phone (the record was sent without it). */
  photoMissing: boolean;
  /** The tag shown at the right. */
  tag: 'saved' | 'sending' | 'sent' | 'waiting' | 'held';
  /** Under "Held": why it was not sent (the footnote); null when nothing is known. */
  reason: string | null;
  /** The record a tap opens, when it exists. */
  target: { grnId?: string; dispatchId?: string };
}

export interface UnsentListState {
  loaded: boolean;
  rows: UnsentListRow[];
  lastSentAt: number | null;
}

const numberOf = (value: unknown): string | null => {
  if (typeof value === 'object' && value !== null && 'number' in value) {
    const number: unknown = value.number;
    if (typeof number === 'string' || typeof number === 'number') return String(number);
  }
  return null;
};

/** The words for what an item is. A photos item is described from its files; any other kind keeps the words it was saved with. */
async function titleOf(row: UnsentRowView): Promise<{ title: string; photoMissing: boolean }> {
  if (row.kind !== 'photos') return { title: row.what, photoMissing: false };
  const photos = await photosOfItem(row.id);
  const count = photos.length;
  const dispatch = row.photoDoc === 'dispatch';
  const number = row.targetNumber;
  // A document with no number yet (a new one not sent) is "the new GRN" or "the new dispatch" (Design 4.10).
  const key = number
    ? dispatch
      ? 'offline.unsent.whatPhotosDispatch'
      : 'offline.unsent.whatPhotos'
    : dispatch
      ? 'offline.unsent.whatPhotosNewDispatch'
      : 'offline.unsent.whatPhotosNewGrn';
  return {
    title: tr(key, { count, number: number ?? '' }),
    photoMissing: photos.some(photo => photo.missing === 1),
  };
}

/** The tag of a row: a record waiting for the GRN it depends on reads "Waiting for its GRN". */
function tagOf(state: ItemState): UnsentListRow['tag'] {
  switch (state) {
    case 'sending':
      return 'sending';
    case 'sent':
      return 'sent';
    case 'waiting':
      return 'waiting';
    case 'refused':
      return 'held';
    case 'saved':
      return 'saved';
  }
}

/**
 * The footnote of a held item: what follows a refused item says so in its own words, never the refused item's reason
 * (Design 4.6). A refused item never shows the server's raw text: its words are `refusedGeneric` (Design 4.10; 7.5's
 * sentences need the values of the refusal and have no Gujarati yet, so none is a known reason here).
 */
function heldReason(reason: string | null): string | null {
  if (reason === null) return null;
  return reason.startsWith(DEPENDS_ON_REFUSED) ? tr('offline.unsent.dependsOnRefused') : tr('offline.unsent.refusedGeneric');
}

export async function loadUnsentList(): Promise<{ rows: UnsentListRow[]; lastSentAt: number | null }> {
  const views = await listItems();
  const rows: UnsentListRow[] = [];
  for (const view of views) {
    const { title, photoMissing } = await titleOf(view);
    rows.push({
      id: view.id,
      state: view.state,
      section: view.section,
      title,
      customer: view.customer,
      recordedAt: view.recordedAt,
      sentNumber: view.section === 'sent' ? numberOf(view.result) : null,
      photoMissing,
      tag: tagOf(view.state),
      reason: view.section === 'held' ? heldReason(view.reason) : null,
      target: view.target,
    });
  }
  // "Not sent yet" oldest first (the order they are sent); "Held": each refused item with what follows it directly under
  // it; "Sent today" newest first.
  const unsent = rows.filter(row => row.section === 'unsent');
  const heldIds = new Set(views.filter(view => view.section === 'held').map(view => view.id));
  const roots = views.filter(view => view.section === 'held' && !(view.dependsOn !== null && heldIds.has(view.dependsOn)));
  const held: UnsentListRow[] = [];
  const place = (id: string) => {
    const row = rows.find(own => own.id === id);
    if (row) held.push(row);
    for (const view of views) if (view.section === 'held' && view.dependsOn === id) place(view.id);
  };
  for (const root of roots) place(root.id);
  const sent = rows.filter(row => row.section === 'sent').reverse();
  return { rows: [...unsent, ...held, ...sent], lastSentAt: await getLastSentAt() };
}

/** The list as a hook: loaded again on every change of the store. */
export function useUnsentList(): UnsentListState {
  const [state, setState] = useState<UnsentListState>({ loaded: false, rows: [], lastSentAt: null });
  useEffect(() => {
    // The latest read wins; one that answers after the screen is gone is dropped.
    let latest = 0;
    let live = true;
    const run = async () => {
      const mine = ++latest;
      let next: UnsentListState;
      try {
        next = { loaded: true, ...(await loadUnsentList()) };
      } catch (error) {
        logger.warn('The unsent list could not be read', loggableError(error));
        next = { loaded: true, rows: [], lastSentAt: null };
      }
      if (live && mine === latest) setState(next);
    };
    void run();
    const stop = subscribeUnsent(() => void run());
    return () => {
      live = false;
      stop();
    };
  }, []);
  return state;
}
