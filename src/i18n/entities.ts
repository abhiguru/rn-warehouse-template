/**
 * Stable names for the things a shared component can be about.
 *
 * A shared component that builds a sentence around a noun ("Delete GRN 12?",
 * "Print dispatch") takes one of these and picks a whole-sentence key with it
 * (`components.actions.grn.print`), so each language words the sentence its own
 * way. Never pass a translated noun to be placed into a sentence (docs/I18N.md).
 */
export type DocumentEntity = 'grn' | 'dispatch' | 'invoice';
export type AppEntity = DocumentEntity | 'customer' | 'item';
/** Whether a form makes a new record or changes an existing one. */
export type EntityMode = 'create' | 'edit';
