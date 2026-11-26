/**
 * What the "Unsent items" screen lists (WH-301, contract section 10; Design 4.2): the signed-in person's own items, the
 * ones not sent yet oldest first and the ones sent today newest first, each with the words of its row. Another person's
 * items are never listed (spec step 27).
 */
import { useEffect, useState } from 'react';
import { createLogger, loggableError } from '@/utils/logger';
import { t as tr } from '@/i18n';
import { listItems, photosOfItem, type UnsentRowView } from './unsentQueue';
import { getLastSentAt, type ItemState } from './unsentRows';
import { subscribeUnsent } from './unsentStore';

const logger = createLogger('[unsent-list]');

export interface UnsentListRow {
  id: string;
  state: ItemState;
  section: 'unsent' | 'sent';
  /** The row's title in the person's language, and the customer. */
  title: string;
  customer: string | null;
  recordedAt: number;
  /** The server's number once a record is sent ("Sent · GRN 312"), 0-9 as an identifier. */
  sentNumber: string | null;
  /** A photo file of this item is gone from the phone (the record was sent without it). */
  photoMissing: boolean;
  /** The tag shown at the right. */
  tag: 'saved' | 'sending' | 'sent' | 'waiting';
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
  return {
    title: tr('offline.unsent.whatPhotos', { count: photos.length, number: row.targetNumber ?? '' }),
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
    case 'saved':
    case 'refused':
      return 'saved';
  }
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
      target: view.target,
    });
  }
  // "Not sent yet" oldest first (the order they are sent); "Sent today" newest first.
  const unsent = rows.filter(row => row.section === 'unsent');
  const sent = rows.filter(row => row.section === 'sent').reverse();
  return { rows: [...unsent, ...sent], lastSentAt: await getLastSentAt() };
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
