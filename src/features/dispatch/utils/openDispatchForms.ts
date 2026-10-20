/**
 * Which dispatch forms are open (review 2026-10-20, finding 3).
 *
 * The dispatch form lives in one store slice, so only one dispatch can be in it at a time. A form for another
 * dispatch, or a new dispatch, opened over a form that is still open would reset or load into the same slice and swap
 * (or wipe) the first form's data under it. The layouts of both forms (`dispatch-form` and `dispatch-edit`) register
 * here while they are open, and an entry that would open a second form asks first and turns the visit away instead.
 * The edit layout empties the slice only when the last open form closes.
 *
 * The same pattern as the invoice forms (src/features/invoice/utils/openInvoiceForms.ts), with one difference: no
 * form is opened over another one at all, also not a second edit of the same dispatch (nothing in the app opens one
 * on purpose, and two layouts over one form leave the lower one with a form the upper one emptied).
 */

export type OpenDispatchForm =
  | { kind: 'create' }
  // `number`: the dispatch's own number, set by its layout once the dispatch is loaded (the refusal names it).
  | { kind: 'edit'; id: string; number?: string };

/** Where an open form is: the route a refusal takes the person back to ("Open it"). */
export function dispatchFormRoute(form: OpenDispatchForm): string {
  return form.kind === 'edit' ? `/dispatch-edit/${form.id}/step1` : '/dispatch-form/step1';
}

const open = new Set<OpenDispatchForm>();

/** Records an open form; call the result when the form's layout closes. */
export function registerDispatchForm(form: OpenDispatchForm): () => void {
  open.add(form);
  return () => {
    open.delete(form);
  };
}

/** An open form that another form may not be opened over; null when none is open. */
export function openDispatchFormBlocking(): OpenDispatchForm | null {
  for (const other of open) return other;
  return null;
}

/** How many forms are open: the last one to close empties the slice. */
export function openDispatchFormCount(): number {
  return open.size;
}
