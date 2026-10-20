import type { CreateInvoiceResponse } from '@/types/invoice.types';
import { checkSubmission } from '@/utils/lostAnswer';
import { createLogger } from '@/utils/logger';

const log = createLogger('InvoiceLostAnswer');

/** What a save came to: the server's answer, or `left` when the person left the form while the answer was awaited. */
export type SaveOutcome = CreateInvoiceResponse | 'left';

interface SendUntilAnsweredOptions {
  /** One send of the save. The same request every time: the same body and the same request code. */
  send: () => Promise<CreateInvoiceResponse>;
  /** The request code the save is sent with (`p_invoice_data.request_key`). */
  requestKey: string;
  /** The answer the server stored under the code, as the screen's own success; null when it is no usable success. */
  fromStored: (response: unknown) => Promise<CreateInvoiceResponse | null>;
  /** Aborted when the person leaves the form: nothing is asked or sent after that. */
  signal: AbortSignal;
  /** True while an answer is lost and the form is locked; false when the loop is over. */
  onLocked: (locked: boolean) => void;
}

/**
 * Sends a save and, when its answer is lost (owner rule D22), does not give up and does not guess:
 *  1. the form is locked (`onLocked(true)`);
 *  2. it waits for the connection and for the server to have had its time, then asks the server for the answer
 *     stored under the request code (`checkSubmission`);
 *  3. found: that answer is the save's answer, handled as the normal success;
 *     not found: the identical request is sent once more (same body, same code) and its answer is handled normally.
 *     When that answer is lost as well, the loop goes round again.
 * An answer that never reaches the server's table cannot be confused with a refusal: only a lost answer loops.
 */
export async function sendUntilAnswered(options: SendUntilAnsweredOptions): Promise<SaveOutcome> {
  const { send, requestKey, fromStored, signal, onLocked } = options;
  let result = await send();
  try {
    while (result.lostAnswer) {
      onLocked(true);
      let stored: CreateInvoiceResponse | null = null;
      try {
        const found = await checkSubmission(requestKey, result.lostAnswer.sentAt, signal);
        if (signal.aborted) return 'left';
        if (found.found) stored = await fromStored(found.response);
      } catch (error) {
        if (signal.aborted) return 'left';
        // The check ends only with an answer or when it is aborted. If it ever fails otherwise, the request is sent
        // again: the same code makes the server give back its stored answer instead of writing twice.
        log.warn('The check for a lost save failed:', error);
      }
      if (signal.aborted) return 'left';
      if (stored) return stored;
      result = await send();
      if (signal.aborted) return 'left';
    }
    return result;
  } finally {
    onLocked(false);
  }
}
