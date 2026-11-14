import { openFormBlocking } from './openInvoiceForms';
import { showOpenFormRefusal } from './refuseOpenForm';
import { billsMayStart } from '@/features/gst/billsAllowed';

/**
 * The start of a new bill, shared by all three entries (the Invoices button, the empty list's button, GRN details' Create
 * invoice). One rule: ask `can_make_bills`, and when the answer comes only the latest tap may go on, and only while its
 * screen is still in front and no other invoice form is open (J1: such a form is never reset). Anything else does nothing:
 * no reset, no navigation, no alert.
 *
 * Each tap takes a new token, so an older request that is still waiting can never go after a newer tap. After 'go' the
 * entry is busy until `releaseNewBill` (the screens' focus effects, or the entry itself when it gives up).
 */
let latest = 0;
let opening = false;
let goneToken = 0;

export function releaseNewBill(): void {
  opening = false;
}

/** The token of the request that last got 'go'. A longer job after 'go' keeps it and asks `newBillIsCurrent` before it writes. */
export const newBillToken = (): number => goneToken;

/** True while no newer tap has taken over from that request. */
export const newBillIsCurrent = (token: number): boolean => token === latest;

/** 'go': the caller resets the form and opens it. 'stop': nothing to do (refused, busy, superseded, another form open, screen left). */
export async function beginNewBill(role: string | null | undefined, isFocused: () => boolean): Promise<'go' | 'stop'> {
  if (opening) return 'stop';
  const blocker = openFormBlocking({ kind: 'create' });
  if (blocker) {
    showOpenFormRefusal(blocker);
    return 'stop';
  }
  latest += 1;
  const token = latest;
  const stillWanted = () => token === latest && isFocused() && !openFormBlocking({ kind: 'create' });
  const go = (await billsMayStart(role, stillWanted)) && stillWanted();
  if (!go) return 'stop';
  opening = true;
  goneToken = token;
  return 'go';
}
