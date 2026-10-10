/**
 * What an "is this number taken?" answer means for the form that asked.
 *
 * The GRN and dispatch forms check the typed number against the server. The
 * document being edited already holds its own number, so finding that document
 * is not a clash; finding any other document is. A check that failed says
 * nothing either way.
 */
export type DocumentNumberState = 'free' | 'own' | 'taken' | 'unknown';

export interface DocumentNumberCheck {
  exists: boolean;
  /** Id of the document that holds the number, when one does. */
  id?: string;
  /** True when the check itself failed (no connection, refused). */
  error?: boolean;
}

/**
 * @param check the answer from the server
 * @param ownId id of the document open for editing; empty when creating
 */
export function documentNumberState(
  check: DocumentNumberCheck,
  ownId?: string | null
): DocumentNumberState {
  if (check.error) return 'unknown';
  if (!check.exists || !check.id) return 'free';
  return ownId && check.id === ownId ? 'own' : 'taken';
}
