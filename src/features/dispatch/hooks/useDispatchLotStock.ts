/**
 * useDispatchLotStock - the stock of each lot of a dispatch being edited, read again from its GRN.
 *
 * The lines of an edited dispatch hold the stock as it was when they were added; the Review step shows what the
 * GRNs hold now. One read per distinct GRN number, all in parallel (not one per line, not one after another). A
 * newer read, a change of the GRNs or leaving the screen makes an older answer stale and it is dropped. A GRN
 * that cannot be read makes the whole answer an error: a stock that is only partly checked is not shown as checked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import type { DispatchItemData } from '@/types/dispatch.types';
import { createLogger } from '@/utils/logger';

const log = createLogger('dispatch');

export type DispatchLotStockStatus = 'loading' | 'ready' | 'error';

export interface DispatchLotStock {
    status: DispatchLotStockStatus;
    /** The stock of a lot as read; undefined while loading, after an error, or for a lot the GRN no longer lists. */
    stockOf: (lotId: string) => number | undefined;
    /** Reads every GRN again. */
    retry: () => void;
}

const SEPARATOR = '\n';

/** `enabled` is false in a new dispatch, where the lines already hold the stock just read. */
export function useDispatchLotStock(items: readonly Pick<DispatchItemData, 'grns_gr_no'>[], enabled: boolean): DispatchLotStock {
    // The distinct GRN numbers as one string, so a new array of the same GRNs does not read again.
    const grnKey = useMemo(() => [...new Set(items.map((item) => item.grns_gr_no))].sort().join(SEPARATOR), [items]);
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<{ status: DispatchLotStockStatus; stock: Record<string, number> }>({ status: 'loading', stock: {} });
    const latest = useRef(0);

    useEffect(() => {
        const requestId = ++latest.current;
        if (!enabled || grnKey === '') {
            setState({ status: 'ready', stock: {} });
            return () => {
                latest.current++;
            };
        }
        setState((current) => (current.status === 'loading' ? current : { status: 'loading', stock: {} }));
        const numbers = grnKey.split(SEPARATOR);
        // The zero-stock lots too: a line that took the last bags of its lot shows 0, not the old figure.
        Promise.all(
            numbers.map(async (number) => {
                try {
                    const result = await getGRNDetailByNumber(number, true);
                    return result.success && result.data?.items ? result.data.items : null;
                } catch {
                    return null;
                }
            })
        ).then((lists) => {
            if (requestId !== latest.current) return;
            
            if (lists.some((list) => list === null)) {
                log.warn('Stock of a dispatch lot could not be read', { grns: numbers.length, failed: lists.filter((list) => list === null).length });
                setState({ status: 'error', stock: {} });
                return;
            }
            const stock: Record<string, number> = {};
            lists.forEach((list) => list?.forEach((lot: { id: string; stock: number }) => { stock[lot.id] = lot.stock; }));
            setState({ status: 'ready', stock });
        });
        return () => {
            latest.current++;
        };
    }, [enabled, grnKey, attempt]);

    const stockOf = useCallback((lotId: string) => (state.status === 'ready' ? state.stock[lotId] : undefined), [state]);
    const retry = useCallback(() => setAttempt((count) => count + 1), []);
    return useMemo(() => ({ status: state.status, stockOf, retry }), [state.status, stockOf, retry]);
}
