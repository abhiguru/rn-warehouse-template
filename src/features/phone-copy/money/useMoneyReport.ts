/**
 * Customer dues and a customer's Statement as the server last answered (WH-305, contract 4, 5 and 13): the hook the two
 * screens use when `moneyOn()`. It has `useLiveReport`'s shape (what ReportScaffold reads) and adds the age of the figures.
 *
 * - Opening or pulling down online: the kept answer shows at once, the server is asked, the new answer replaces it in place
 *   and is kept. The customer's mark is cleared when the request starts, so a mark arriving meanwhile survives.
 * - Offline: no request. The kept answer, or `notHere`.
 * - A failure with an answer on screen keeps it and says so (`refreshFailed`); an access refusal erases every kept answer
 *   and shows the refusal alone. The phone computes no money: it keeps and draws what the server answered.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReportPhase } from '@/features/reports/useReportQuery';
import { isCopyOffline } from '../syncEngine';
import type { MoneyFetched } from './moneyFetch';
import {
  clearMark, copyHasStock, deleteMoneyAnswer, eraseMoney, isMarked, readMoneyAnswer, restoreMark, writeMoneyAnswer, type MoneyKind,
} from './moneyStore';

export interface MoneyAgeInfo {
  asOf: string;
  today: string | null;
  hasStock: boolean;
}

export interface MoneyReport<T> {
  data: T | undefined;
  phase: ReportPhase;
  isRefreshing: boolean;
  isFetching: boolean;
  updatedAt: undefined;
  error: string | null;
  refresh: () => Promise<boolean>;
  retry: () => void;
  /** The answer is the phone's own record of the server's: sharing needs a connection while offline. */
  fromPhoneCopy: boolean;
  /** Offline, and nothing was ever kept for this screen. */
  notHere: boolean;
  /** The time, day and goods-in-store of the answer on screen. */
  age: MoneyAgeInfo | null;
  /** The last refresh failed with this answer on screen. */
  refreshFailed: boolean;
}

interface Options<T extends { as_of: string; today: string }> {
  kind: Exclude<MoneyKind, 'activity'>;
  /** The key of the kept answer: '' for dues, the customer's id for a statement. */
  id: string;
  fetch: () => Promise<MoneyFetched<T>>;
  map: (body: unknown) => T;
  /** The answer's own goods in store (the copy's stock is read besides). */
  answerHasStock: (data: T) => boolean;
  /** The customer whose stock keeps the rent sentence, null for every customer. */
  stockOf: string | null;
  fallbackError: string;
}

interface State<T> {
  data: T | undefined;
  phase: ReportPhase;
  error: string | null;
  notHere: boolean;
  age: MoneyAgeInfo | null;
  refreshFailed: boolean;
}

const EMPTY = { data: undefined, phase: 'loading' as ReportPhase, error: null, notHere: false, age: null, refreshFailed: false };

export function useMoneyReport<T extends { as_of: string; today: string }>(options: Options<T>): MoneyReport<T> {
  const [state, setState] = useState<State<T>>(EMPTY);
  const [isFetching, setFetching] = useState(true);
  const [isRefreshing, setRefreshing] = useState(false);
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const sequence = useRef(0);
  const mounted = useRef(true);
  const shown = useRef<T | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const draw = useCallback(async (data: T, today: string | null, failed: boolean, seq: number): Promise<void> => {
    const { answerHasStock, stockOf } = latest.current;
    const hasStock = answerHasStock(data) || (await copyHasStock(stockOf));
    if (!mounted.current || seq !== sequence.current) return;
    shown.current = data;
    setState({ data, phase: 'ready', error: null, notHere: false, age: { asOf: data.as_of, today, hasStock }, refreshFailed: failed });
  }, []);

  const showKept = useCallback(async (failed: boolean, seq: number): Promise<boolean> => {
    const { kind, id, map } = latest.current;
    const kept = await readMoneyAnswer(kind, id);
    if (!kept || !mounted.current || seq !== sequence.current) return false;
    await draw({ ...map(kept.body), as_of: kept.asOf }, kept.today, failed, seq);
    return true;
  }, [draw]);

  const load = useCallback(async (): Promise<boolean> => {
    const seq = ++sequence.current;
    const { kind, id, fetch, fallbackError } = latest.current;
    const done = (): void => {
      if (!mounted.current || seq !== sequence.current) return;
      setFetching(false);
      setRefreshing(false);
    };
    try {
      if (isCopyOffline()) {
        const found = shown.current !== undefined || (await showKept(false, seq));
        if (!found && mounted.current && seq === sequence.current) setState({ ...EMPTY, phase: 'ready', notHere: true });
        return false;
      }
      if (shown.current === undefined) void showKept(false, seq);
      const wasMarked = await isMarked(kind, id);
      await clearMark(kind, id);
      const got = await fetch();
      if (!mounted.current || seq !== sequence.current) {
        if (got.kind === 'answer') await writeMoneyAnswer({ kind, key: id, asOf: got.asOf, today: got.today, body: got.body });
        else if (wasMarked && got.kind === 'failed') await restoreMark(kind, id);
        return false;
      }
      if (got.kind === 'answer') {
        await writeMoneyAnswer({ kind, key: id, asOf: got.asOf, today: got.today, body: got.body });
        await draw(got.data, got.today, false, seq);
        return true;
      }
      if (got.kind === 'refused') {
        await eraseMoney();
        shown.current = undefined;
        setState({ ...EMPTY, phase: 'error', error: got.message ?? fallbackError });
        return false;
      }
      if (got.kind === 'notFound') {
        await deleteMoneyAnswer(kind, id);
        shown.current = undefined;
        setState({ ...EMPTY, phase: 'error', error: fallbackError });
        return false;
      }
      if (wasMarked) await restoreMark(kind, id);
      if (shown.current !== undefined || (await showKept(true, seq))) {
        setState(previous => ({ ...previous, refreshFailed: true }));
      } else {
        setState({ ...EMPTY, phase: 'error', error: got.message ?? fallbackError });
      }
      return false;
    } finally {
      done();
    }
  }, [draw, showKept]);

  const { kind, id } = options;
  useEffect(() => {
    void load();
  }, [kind, id, load]);

  const refresh = useCallback(() => {
    setFetching(true);
    setRefreshing(true);
    return load();
  }, [load]);
  const retry = useCallback(() => {
    setFetching(true);
    void load();
  }, [load]);

  return {
    data: state.data,
    phase: state.phase,
    isRefreshing,
    isFetching,
    updatedAt: undefined,
    error: state.error,
    refresh,
    retry,
    fromPhoneCopy: state.data !== undefined,
    notHere: state.notHere,
    age: state.age,
    refreshFailed: state.refreshFailed,
  };
}
