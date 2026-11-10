/**
 * A new invoice started from GRN details (WH-162).
 *
 * GRN details → Invoices → "Create invoice" opens the invoice form straight at Review, filled as if the person had gone
 * through Details and Items without changing anything: this GRN, today's date, the suggested number and every free
 * dispatch line with the server's figures (prepareInvoiceFromGrn reads them while GRN details is still in front).
 * When the checks of Details or Items would stop the person (no number, a line with no rate), the form opens at that
 * step instead, and the step runs its own Next once, so it shows today's message; a step whose checks pass goes on.
 *
 * Leaving a form opened this way (Cancel, Back on Details, or after the save) returns to the GRN details it came
 * from, not to the Invoices tab. The form's layout forgets the origin when it closes.
 */

export interface InvoiceFormOrigin {
  grnId: string;
  grNo: string;
  /** The GRN details page the form returns to. */
  exitRoute: string;
}

type Stage = 'details' | 'items';

let origin: InvoiceFormOrigin | null = null;
let pending: Stage | null = null;

/**
 * Called by GRN details just before it opens the form (the form slice already filled). `stage`: the step the form opens
 * at when that step must run its own Next once; null when the form opens at Review.
 */
export function startInvoiceFromGrn(from: InvoiceFormOrigin, stage: Stage | null): void {
  origin = from;
  pending = stage;
}

/** The GRN a step should take the form on from, once; null when the form was not opened from GRN details or the way was left. */
export function takeAutoAdvance(stage: Stage): InvoiceFormOrigin | null {
  if (!origin || pending !== stage) return null;
  pending = null;
  return origin;
}

/** Details went on to Items: Items goes on to Review. */
export function continueAutoAdvance(stage: Stage): void {
  if (origin) pending = stage;
}

/** Stops the automatic steps (a step refused, or the person acted first). The form still returns to the GRN. */
export function stopAutoAdvance(): void {
  pending = null;
}

/** Where a new invoice's form goes when it is left: the GRN details it came from, else the Invoices tab. */
export function invoiceFormExitRoute(): string {
  return origin?.exitRoute ?? '/(tabs)/invoices';
}

/** The form's layout closed. */
export function clearInvoiceFormOrigin(): void {
  origin = null;
  pending = null;
}
