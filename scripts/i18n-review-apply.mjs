#!/usr/bin/env node
/**
 * Applies the native speaker's returned review (WH-149).
 *
 *   node scripts/i18n-review-apply.mjs <folder> [--dry-run]
 *
 * <folder> holds the returned Texts.csv, Reviewer.csv (the reviewer's name and the date) and, optionally, Glossary.csv
 * (see scripts/i18n-review-sheet.mjs).
 *  - A row with text in "Reviewer's Gujarati" replaces the draft in src/i18n/locales/gu/*.ts, unless its {{placeholders}}
 *    differ from the English (the row is refused and listed).
 *  - A row whose draft no longer matches the app (edited since the list was made) is refused and listed.
 *  - A row whose English differs from the app's current English is not applied or recorded and is listed for the reviewer.
 *  - A row with a Comment and no new text is listed for Product and stays unreviewed.
 *  - Every other row (changed or left as it was) is recorded as reviewed in docs/GUJARATI_REVIEWED.json, but only when
 *    Reviewer.csv carries a reviewer name and a date (a changed cell is not required: a draft may be accepted as it is).
 *    Without them the corrections are still written, nothing is recorded as reviewed, and the script says so.
 *  - Glossary rows: the status becomes "Reviewed (date)" (same condition) and a reviewer's Gujarati replaces the term.
 * Review the diff, then run the text tests and commit: it is one batch.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { glossaryPath, glossaryRows, parseCsv, placeholders, readReviewed, replaceTexts, textHash, withTables, writeReviewed } from './i18n-texts.mjs';

const args = process.argv.slice(2);
const folder = args.find(arg => !arg.startsWith('--'));
if (!folder) {
  console.error('Usage: node scripts/i18n-review-apply.mjs <folder> [--dry-run]');
  process.exit(2);
}
const dryRun = args.includes('--dry-run');

/** Rows as objects keyed by header. A spreadsheet in some locales saves with ";" instead of ",". */
function readTable(path) {
  const text = readFileSync(path, 'utf8');
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
  const [header, ...rows] = parseCsv(text, first.split(';').length > first.split(',').length ? ';' : ',');
  const names = header.map(name => name.trim().replace(/[‘’]/g, "'"));
  return rows.map(row => Object.fromEntries(names.map((name, i) => [name, (row[i] ?? '').trim()])));
}

const textsFile = join(resolve(folder), 'Texts.csv');
if (!existsSync(textsFile)) {
  console.error(`No Texts.csv in ${folder}`);
  process.exit(2);
}

// Who reviewed and when: Reviewer.csv, first row. Texts are recorded as reviewed only when both are filled.
const reviewerFile = join(resolve(folder), 'Reviewer.csv');
const reviewerRow = existsSync(reviewerFile) ? readTable(reviewerFile)[0] : undefined;
const reviewerName = reviewerRow?.['Reviewer name'] ?? '';
const reviewedDate = reviewerRow?.['Reviewed on (YYYY-MM-DD)'] ?? '';
const reviewerKnown = reviewerName !== '' && /^\d{4}-\d{2}-\d{2}$/.test(reviewedDate) && !Number.isNaN(Date.parse(reviewedDate));
const date = reviewedDate;

const changes = new Map();
const reviewedNow = new Map();
const refused = [];
const commentOnly = [];
const englishChanged = [];
let unchanged = 0;

withTables(({ en, gu }) => {
  for (const row of readTable(textsFile)) {
    const key = row.Key;
    if (!gu.has(key)) { refused.push(`${key}: not a Gujarati text of the app any more`); continue; }
    const current = gu.get(key);
    if (row['Gujarati draft'] !== current.trim()) { refused.push(`${key}: the draft changed since the list was made`); continue; }
    if (row.English.replace(/\r\n?/g, '\n') !== (en.get(key) ?? '').trim().replace(/\r\n?/g, '\n')) { englishChanged.push(`${key}: the English changed since the list was made`); continue; }
    const proposed = row["Reviewer's Gujarati"];
    const comment = row.Comment;
    if (proposed === '' && comment !== '') { commentOnly.push(`${key}: ${comment}`); continue; }
    if (proposed !== '' && proposed !== current.trim()) {
      if (placeholders(proposed) !== placeholders(en.get(key) ?? '')) {
        refused.push(`${key}: placeholders differ from the English (${placeholders(en.get(key) ?? '') || 'none'}); keep them exactly`);
        continue;
      }
      changes.set(key, proposed);
      if (reviewerKnown) reviewedNow.set(key, textHash(proposed));
    } else {
      unchanged++;
      if (reviewerKnown) reviewedNow.set(key, textHash(current));
    }
    if (proposed !== '' && comment !== '') commentOnly.push(`${key} (applied, with comment): ${comment}`);
  }
});

// Glossary: match a row by its English and Gujarati cells.
const glossaryFile = join(resolve(folder), 'Glossary.csv');
const glossaryComments = [];
let glossaryDone = 0;
const mdLines = readFileSync(glossaryPath, 'utf8').split('\n');
if (existsSync(glossaryFile)) {
  const rows = glossaryRows(mdLines);
  for (const row of readTable(glossaryFile)) {
    const at = rows.find(candidate => candidate.cells[0] === row.English && candidate.cells[1] === row.Gujarati);
    if (!at) { refused.push(`Glossary "${row.English}": row not found (changed since the list was made)`); continue; }
    if (row.Comment !== '' && row["Reviewer's Gujarati"] === '') { glossaryComments.push(`${row.English}: ${row.Comment}`); continue; }
    if (row["Reviewer's Gujarati"] !== '') at.cells[1] = row["Reviewer's Gujarati"];
    if (reviewerKnown) at.cells[at.cells.length - 1] = `Reviewed (${date})`;
    if (row["Reviewer's Gujarati"] !== '' && row.Comment !== '') glossaryComments.push(`${row.English} (applied, with comment): ${row.Comment}`);
    if (!reviewerKnown && row["Reviewer's Gujarati"] === '') continue;
    mdLines[at.line] = `| ${at.cells.join(' | ')} |`;
    glossaryDone++;
  }
}

if (!dryRun) {
  const files = changes.size > 0 ? replaceTexts(changes) : [];
  if (reviewedNow.size > 0) {
    const record = readReviewed();
    writeReviewed({ reviewedOn: date, texts: { ...record.texts, ...Object.fromEntries(reviewedNow) } });
  }
  if (glossaryDone > 0) writeFileSync(glossaryPath, mdLines.join('\n'));
  if (files.length > 0) console.log(`Wrote ${files.length} file(s) in src/i18n/locales/gu.`);
}
console.log(`${dryRun ? '[dry run] ' : ''}${changes.size} text(s) changed, ${unchanged} kept, ${glossaryDone} glossary row(s) reviewed.`);
const list = (title, items) => items.length > 0 && console.log(`\n${title} (${items.length}):\n${items.map(item => `  ${item}`).join('\n')}`);
list('Comments without new text, for Product (these stay unreviewed)', [...commentOnly, ...glossaryComments.map(item => `Glossary ${item}`)]);
list('English changed in the app since the list was made: not applied or recorded, review again from a new sheet', englishChanged);
list('Refused', refused);
if (!reviewerKnown) console.log('\nNothing was recorded as reviewed: Reviewer.csv needs a reviewer name and a date (YYYY-MM-DD).');
process.exitCode = refused.length > 0 ? 1 : 0;
