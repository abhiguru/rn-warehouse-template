/**
 * The date of the legal text (terms and privacy), written YYYY-MM-DD (WH-140). It is shown as "Last updated" and,
 * as TERMS_VERSION (src/config/envConfig.ts), is the terms version central sign-in records, so the two cannot
 * differ. A changed text needs a new date. A leaf module on purpose: envConfig must not import the legal pages' code.
 */
export const LEGAL_UPDATED = '2026-11-07';
