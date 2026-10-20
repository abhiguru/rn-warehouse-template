/**
 * The rates and active items the Items list and the item page's Pricing tab show.
 *
 * They are kept in a session cache (module level, for the facility and the person signed in):
 * a screen that opens with data in the cache shows it at once and refreshes in the background,
 * with no skeleton and no jump (P-16). The whole cache is read again only when it is older than
 * RATES_STALE_MS (or by pull to refresh, or reloadItemRatesCache). A save elsewhere calls notifyRatesChanged(itemId) (contract.ts),
 * which refetches that item's rows only and merges them in.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { listActiveItems, listAllRates, listItemRates } from '@/services/item-pricing-service';
import { useAppSelector } from '@/store/hooks';
import type { ActiveItem, ItemStoragePrice } from '@/types/item-pricing.types';
import { ratesChangeCount, subscribeRatesChanged } from './contract';
import type { ItemRates } from './rateModel';

export type RatesStatus = 'loading' | 'ready' | 'error';

interface Snapshot {
  key: string;
  items: ActiveItem[];
  rates: ItemStoragePrice[];
  loadedAt: number;
}

// ---- module cache ----------------------------------------------------------
let snapshot: Snapshot | null = null;
let inFlightAll: Promise<void> | null = null;
let inFlightKey: string | null = null;
/** Bumped by every new full load and by clearItemRatesCache: a load that is no longer the latest drops its result. */
let loadSeq = 0;
/** A read of one item in flight, and how many changes of that item had been announced when it began. */
const inFlightItem = new Map<string, { promise: Promise<ItemStoragePrice[]>; changes: number }>();
const subscribers = new Set<() => void>();
let unsubscribeChanges: (() => void) | null = null;

const emit = () => subscribers.forEach(fn => fn());
const subscribe = (fn: () => void) => {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
};

/** Forget what was loaded (sign-out, facility change, tests). */
export function clearItemRatesCache(): void {
  snapshot = null;
  inFlightAll = null;
  inFlightKey = null;
  loadSeq += 1;
  inFlightItem.clear();
  appliedRead.clear();
  emit();
}

/** The cache is read again on screen focus only when it is older than this. */
export const RATES_STALE_MS = 5 * 60 * 1000;

/** One full load (items and every rate) for this facility and person; a load already running is joined. */
function loadAllFor(key: string): Promise<void> {
  if (!inFlightAll || inFlightKey !== key) {
    const seq = ++loadSeq;
    const promise: Promise<void> = (async () => {
      const [items, rates] = await Promise.all([listActiveItems(), listAllRates()]);
      if (seq !== loadSeq) return;
      snapshot = { key, items, rates, loadedAt: Date.now() };
      emit();
    })().finally(() => {
      if (inFlightAll === promise) {
        inFlightAll = null;
        inFlightKey = null;
      }
    });
    inFlightAll = promise;
    inFlightKey = key;
  }
  return inFlightAll;
}

/** Read the whole cache again when something changed the set of active items (a deactivate or delete elsewhere). */
export function reloadItemRatesCache(): Promise<void> {
  const key = snapshot?.key;
  return key ? loadAllFor(key).catch(() => { /* the screens keep the older data */ }) : Promise.resolve();
}

/** When the whole cache was last read (ms since the epoch); 0 when nothing is held. */
export function itemRatesLoadedAt(): number {
  return snapshot?.loadedAt ?? 0;
}

const currentKey = (userId: string | undefined): string =>
  `${getActiveOperatorServer()?.instanceId ?? 'none'}|${userId ?? 'none'}`;

/** One fetch per item at a time: the list and an open page both ask after a save. */
function fetchItemRows(itemId: string): Promise<ItemStoragePrice[]> {
  const changes = ratesChangeCount(itemId);
  const running = inFlightItem.get(itemId);
  // A read that began before the latest announced change may hold rows from before it: start a new one.
  if (running && running.changes === changes) return running.promise;
  const entry: { promise: Promise<ItemStoragePrice[]>; changes: number } = {
    changes,
    promise: listItemRates(itemId).finally(() => {
      if (inFlightItem.get(itemId) === entry) inFlightItem.delete(itemId);
    }),
  };
  inFlightItem.set(itemId, entry);
  return entry.promise;
}

/** The newest read of each item that was applied: an older answer arriving later is dropped. */
const appliedRead = new Map<string, number>();
let readSeq = 0;

const mergeItemRows = (rates: ItemStoragePrice[], itemId: string, rows: ItemStoragePrice[]) =>
  [...rates.filter(r => r.item_id !== itemId), ...rows];

function ensureChangeListener() {
  if (unsubscribeChanges) return;
  unsubscribeChanges = subscribeRatesChanged(itemId => {
    const base = snapshot;
    if (!base) return;
    const seq = ++readSeq;
    fetchItemRows(itemId)
      .then(rows => {
        if (!snapshot || snapshot.key !== base.key) return;
        if ((appliedRead.get(itemId) ?? 0) > seq) return;
        appliedRead.set(itemId, seq);
        snapshot = { ...snapshot, rates: mergeItemRows(snapshot.rates, itemId, rows) };
        emit();
      })
      .catch(() => { /* the screen keeps older rates; the next refresh shows the failure */ });
  });
}

// ---- the list --------------------------------------------------------------
export interface UseItemRatesResult {
  items: ActiveItem[];
  rates: ItemStoragePrice[];
  status: RatesStatus;
  /** A load is running over data that is already shown. */
  refreshing: boolean;
  /** When the data shown was loaded (ms), or null. */
  lastUpdated: number | null;
  /** A refresh failed and the data shown is older. */
  refreshError: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  /** Refresh only when the data held is older than a few minutes (saves in the app already merge in). */
  refreshIfStale: () => Promise<void>;
  /** One item's rows, from the data loaded. */
  itemRates: (itemId: string) => ItemRates | undefined;
}

export function useItemRates(): UseItemRatesResult {
  const userId = useAppSelector(state => state.auth.userProfile?.id);
  const key = currentKey(userId);
  const stored = useSyncExternalStore(subscribe, () => snapshot);
  const data = stored && stored.key === key ? stored : null;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(() => loadAllFor(key), [key]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
      setRefreshError(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const refreshIfStale = useCallback(async () => {
    const held = snapshot && snapshot.key === key ? snapshot : null;
    if (held && Date.now() - held.loadedAt < RATES_STALE_MS) return;
    await refresh();
  }, [key, refresh]);

  useEffect(() => {
    ensureChangeListener();
    void refreshIfStale();
    // Load once per mount and facility, unless the cache is fresh.
  }, [key]);

  const itemRates = useCallback(
    (itemId: string): ItemRates | undefined => {
      const item = data?.items.find(i => i.id === itemId);
      return item ? { item, rows: data!.rates.filter(r => r.item_id === itemId) } : undefined;
    },
    [data],
  );

  const status: RatesStatus = data ? 'ready' : refreshError ? 'error' : 'loading';
  return {
    items: data?.items ?? EMPTY_ITEMS,
    rates: data?.rates ?? EMPTY_RATES,
    status,
    refreshing: refreshing && Boolean(data),
    lastUpdated: data?.loadedAt ?? null,
    refreshError: refreshError && Boolean(data),
    error,
    refresh,
    refreshIfStale,
    itemRates,
  };
}

const EMPTY_ITEMS: ActiveItem[] = [];
const EMPTY_RATES: ItemStoragePrice[] = [];

// ---- one item (item page's Pricing tab, customer-rate page) -----------------------------
export interface UseItemRatesForResult {
  /** undefined while nothing is known yet. */
  itemRates: ItemRates | undefined;
  status: RatesStatus;
  /** The item is not among the active items. */
  notFound: boolean;
  refreshing: boolean;
  refreshError: boolean;
  lastUpdated: number | null;
  refresh: () => Promise<void>;
}

/**
 * The rows of one item. Shows the list's cache at once when it holds the item, and always
 * reads the item's own rows from the server (never the first page of all rates, P-27).
 */
export function useItemRatesFor(itemId: string): UseItemRatesForResult {
  const userId = useAppSelector(state => state.auth.userProfile?.id);
  const key = currentKey(userId);
  const stored = useSyncExternalStore(subscribe, () => snapshot);
  const cached = stored && stored.key === key ? stored : null;
  // The load reads the cache as it is now, not as it was when the load was created.
  const cachedRef = useRef(cached);
  cachedRef.current = cached;
  const [own, setOwn] = useState<{ item: ActiveItem | null; rows: ItemStoragePrice[]; at: number } | null>(null);
  const pageSeq = useRef(0);
  const pageApplied = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  const load = useCallback(async () => {
    const known = cachedRef.current?.items.find(i => i.id === itemId) ?? null;
    const seq = ++pageSeq.current;
    const [item, rows] = await Promise.all([
      known ? Promise.resolve<ActiveItem | null>(known) : listActiveItems().then(list => list.find(i => i.id === itemId) ?? null),
      fetchItemRows(itemId),
    ]);
    // An older read that finishes after a newer one must not put older rows on the page.
    if (seq < pageApplied.current) return;
    pageApplied.current = seq;
    setOwn({ item, rows, at: Date.now() });
  // The item list read happens only when the cache does not hold the item.
  }, [itemId, key]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
      setRefreshError(false);
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
    return subscribeRatesChanged(changed => { if (changed === itemId) void refresh(); });
  }, [itemId, key, refresh]);

  const fromCache = cached?.items.find(i => i.id === itemId);
  const result = useMemo<ItemRates | undefined>(() => {
    if (own?.item) return { item: own.item, rows: own.rows };
    if (!own && fromCache) return { item: fromCache, rows: cached!.rates.filter(r => r.item_id === itemId) };
    return undefined;
  }, [own, fromCache, cached, itemId]);

  const notFound = Boolean(own && !own.item);
  const status: RatesStatus = result || notFound ? 'ready' : refreshError ? 'error' : 'loading';
  return {
    itemRates: result,
    status,
    notFound,
    refreshing: refreshing && status === 'ready',
    refreshError: refreshError && status === 'ready',
    lastUpdated: own?.at ?? cached?.loadedAt ?? null,
    refresh,
  };
}
