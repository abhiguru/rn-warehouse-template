import { openFormBlocking } from './openInvoiceForms';
import { showOpenFormRefusal } from './refuseOpenForm';
import { billsMayStart } from '@/features/gst/billsAllowed';

/**
 * The start of a new bill from the Invoices tab (its button and the empty list's button): one shared busy flag, so two taps
 * during the wait push step 1 once; the open-form check before and after asking `can_make_bills` (J1: a form opened meanwhile
 * is never reset); and no form, reset or alert when the person has left the screen meanwhile.
 * The flag stays set after 'go' until the screen is in front again (`releaseNewBill`, from the screens' focus effects).
 */
let busy = false;

export function releaseNewBill(): void {
  busy = false;
}

/** 'go': the caller resets the form and opens step 1. 'stop': nothing to do (refused, busy, another form open or the screen left). */
export async function beginNewBill(role: string | null | undefined, isFocused: () => boolean): Promise<'go' | 'stop'> {
  if (busy) return 'stop';
  const blocker = openFormBlocking({ kind: 'create' });
  if (blocker) {
    showOpenFormRefusal(blocker);
    return 'stop';
  }
  busy = true;
  let go = false;
  try {
    const stillWanted = () => isFocused() && !openFormBlocking({ kind: 'create' });
    go = (await billsMayStart(role, stillWanted)) && stillWanted();
  } finally {
    if (!go) busy = false;
  }
  return go ? 'go' : 'stop';
}
