import { invoiceDeleteState } from '@/services/invoice-service';
import { waitForServer } from '@/utils/lostAnswer';

/** The wait between two reads of the invoice that failed: 2 s, then doubling, never more than 30 s (owner rule D22d). */
const FIRST_RETRY_MS = 2000;
const LAST_RETRY_MS = 30000;

/** Waits `ms`, or less when `signal` is aborted. */
const pause = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done);
  });

/**
 * What became of a delete whose answer was lost (owner rule D22): waits until the phone is online and the server has
 * had its time since the delete was sent (`waitForServer`), then reads the invoice.
 *  - `gone`: the server says the invoice is not there, so the delete went through.
 *  - `there`: the invoice was read, so the delete did not happen: the caller sends it once more.
 *  - `left`: the person left the page; nothing more is asked.
 * A read that fails (no connection, an error) is repeated with a growing wait, up to 30 s, until it is answered.
 */
export async function resolveLostInvoiceDelete(
  invoiceId: string,
  sentAt: number,
  signal: AbortSignal
): Promise<'gone' | 'there' | 'left'> {
  let wait = FIRST_RETRY_MS;
  for (;;) {
    try {
      await waitForServer(sentAt, signal);
    } catch {
      // Ends with the wait being over, or aborted; an abort is caught just below.
    }
    if (signal.aborted) return 'left';
    const state = await invoiceDeleteState(invoiceId);
    if (signal.aborted) return 'left';
    if (state !== 'unknown') return state;
    await pause(wait, signal);
    wait = Math.min(wait * 2, LAST_RETRY_MS);
  }
}
