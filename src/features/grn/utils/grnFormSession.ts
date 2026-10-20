import * as Crypto from 'expo-crypto';

/**
 * The GRN form's session number. It goes up each time the form is reset or left (resetFormState in
 * useGRNForm, the edit layout closing), so an async step that started under one form can tell that
 * the form it belongs to is gone: the Review step reads the number when Confirm is pressed and
 * checks it again when the save answers, and then leaves the form, the photo files and the screen
 * alone when the form was left in between (a create that finishes after X, Discard and a new GRN
 * must not empty the new form). Kept outside React so every step screen sees the same number.
 */
let session = 0;

/** The number of the form as it stands now. */
export const currentGrnFormSession = (): number => session;

/** The form was reset or left: everything started under the old number is stale. Returns the new number. */
export const nextGrnFormSession = (): number => {
  session += 1;
  return session;
};

/**
 * A random id for one create form (the slice's `submissionNonce`): made by the form's first Create and kept for its
 * retries. Where the native random source is missing a time-and-random id does the same job.
 */
export const newSubmissionNonce = (): string => {
  try {
    const id = Crypto.randomUUID();
    if (typeof id === 'string' && id) return id;
  } catch {
    // fall through to the time-and-random id
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};
