/**
 * The date of the legal text (terms and privacy), written YYYY-MM-DD (WH-140). It is shown as "Last updated" and,
 * as TERMS_VERSION (src/config/envConfig.ts), is the terms version central sign-in records, so the two cannot
 * differ. A changed text needs a new date. A leaf module on purpose: envConfig must not import the legal pages' code.
 */
export const LEGAL_UPDATED = '2026-11-07';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** LEGAL_UPDATED written for the pages, in English whatever the phone's language: '7 November 2026'. */
export function legalUpdatedLabel(updated: string = LEGAL_UPDATED): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(updated);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${Number(match[3])} ${month} ${match[1]}` : updated;
}
