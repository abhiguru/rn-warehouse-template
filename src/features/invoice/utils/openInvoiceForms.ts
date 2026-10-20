/**
 * Which invoice forms are open (J1, review 2026-10-20).
 *
 * The invoice form lives in one store slice, so only one invoice can be in it at a time. A form for
 * another invoice, or a new invoice, opened over a form that is still open would load into the same
 * slice and swap the first form's data under it (and the first form would then save the second
 * invoice). The layouts register here while they are open, and a layout that would open a second,
 * different form asks first and turns the visit away instead.
 *
 * The layouts of the same invoice's edit share one form on purpose (an edit opened again from the
 * GRN's invoice list), so they do not count against each other.
 */

export type OpenInvoiceForm =
  | { kind: 'create' }
  // `number`: the invoice's own number, set by its layout once the invoice is loaded (the refusal names it).
  | { kind: 'edit'; id: string; number?: number };

/** Where an open form is: the route a refusal takes the person back to ("Open it"). */
export function invoiceFormRoute(form: OpenInvoiceForm): string {
  return form.kind === 'edit' ? `/invoice-edit/${form.id}/step1` : '/invoice-form/step1';
}

const open = new Set<OpenInvoiceForm>();

/** Records an open form; call the result when the form's layout closes. */
export function registerInvoiceForm(form: OpenInvoiceForm): () => void {
  open.add(form);
  return () => {
    open.delete(form);
  };
}

/** An open form that `form` may not be opened over; null when there is none. */
export function openFormBlocking(form: OpenInvoiceForm): OpenInvoiceForm | null {
  for (const other of open) {
    if (other.kind === 'edit' && form.kind === 'edit' && other.id === form.id) continue;
    return other;
  }
  return null;
}

/** How many forms are open: the last one to close empties the slice. */
export function openInvoiceFormCount(): number {
  return open.size;
}
