/**
 * The mobile number being typed on the sign-in screen, kept while that screen is
 * rebuilt.
 *
 * Changing the language rebuilds the whole navigation tree (`key={language}` in
 * app/_layout.tsx), which would empty the field. The sign-in screen keeps what
 * was typed here and reads it back when it mounts again.
 *
 * It lives in memory only, never on disk, and belongs to one facility: a number
 * typed for another server is not offered. It is cleared after a successful
 * sign-in and when the sign-in screen is left for any reason other than a
 * language change.
 */
let draft: { phone: string; origin: string } | null = null;

/** The number typed for this facility, or '' when there is none. */
export const readSignInDraft = (origin: string): string => (draft && draft.origin === origin ? draft.phone : '');

export function saveSignInDraft(phone: string, origin: string): void {
  draft = phone ? { phone, origin } : null;
}

export function clearSignInDraft(): void {
  draft = null;
}
