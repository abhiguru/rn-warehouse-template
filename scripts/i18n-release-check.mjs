#!/usr/bin/env node
/**
 * Release check for the Gujarati texts (docs/RELEASE_PREPARATION.md). A pull request may add an English text without a
 * Gujarati one (the app then shows the English text); a release may not. Lists every English key that has no Gujarati
 * text and exits 1 when there is any.
 *
 *   npm run i18n:release-check          # a tag: missing Gujarati fails; unreviewed Gujarati is only reported
 *   npm run i18n:public-check           # going public: unreviewed Gujarati fails too (WH-149)
 *
 * "Reviewed" is recorded in docs/GUJARATI_REVIEWED.json by scripts/i18n-review-apply.mjs: a text counts as reviewed
 * only while its current wording is the one the reviewer saw. It does not check extra or stale Gujarati keys or placeholders: the compiler and src/i18n/__tests__ do.
 */
import { readReviewed, unreviewedKeys, withTables } from './i18n-texts.mjs';

const publicRelease = process.argv.includes('--public');

const { missing, unreviewed } = withTables(({ en, gu }) => ({
  missing: [...en.keys()].filter(key => !gu.has(key)),
  unreviewed: unreviewedKeys(gu, readReviewed()),
}));

if (missing.length > 0) {
  console.error(`${missing.length} English text(s) have no Gujarati text. Add the drafts from docs/GUJARATI_GLOSSARY.md:`);
  for (const path of missing) console.error(`  ${path}`);
  process.exitCode = 1;
} else {
  console.log('Every English text has a Gujarati text.');
}
if (unreviewed.length > 0) {
  const where = publicRelease ? console.error : console.log;
  where(
    `${unreviewed.length} Gujarati text(s) are not reviewed by a native speaker yet (docs/RELEASE_PREPARATION.md, "Gujarati review before going public").` +
      (publicRelease ? ' The first public release needs every text reviewed:' : ' This does not block a tag; it blocks going public (--public).'),
  );
  if (publicRelease) {
    for (const key of unreviewed.slice(0, 50)) console.error(`  ${key}`);
    if (unreviewed.length > 50) console.error(`  ... and ${unreviewed.length - 50} more`);
    process.exitCode = 1;
  }
} else {
  console.log('Every Gujarati text is reviewed.');
}
