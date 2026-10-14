/** user_profiles.name is varchar(30); sign-up cuts to 30 and drops control and bidi characters. */
export const PERSON_NAME_MAX = 30;

/** Same rule as the server's clean_person_name: no control or bidi characters, trimmed, at most 30. */
export function cleanPersonName(name: string): string {
  return (name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .trim()
    .slice(0, PERSON_NAME_MAX);
}
