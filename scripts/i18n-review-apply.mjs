#!/usr/bin/env node
/**
 * Applies the native speaker's returned review (WH-149).
 *
 *   node scripts/i18n-review-apply.mjs <folder> [--date YYYY-MM-DD] [--dry-run]
 *
 * <folder> holds the returned Texts.csv and, optionally, Glossary.csv (see scripts/i18n-review-sheet.mjs).
 *  - A row with text in "Reviewer's Gujarati" replaces the draft in src/i18n/locales/gu/*.ts, unless its {{placeholders}}
 *    differ from the English (the row is refused and listed).
 *  - A row whose draft no longer matches the app (edited since the list was made) is refused and listed.
 *  - A row with a Comment and no new text is listed for Product and stays unreviewed.
 *  - Every other row (changed or left as it was) is recorded as reviewed in docs/GUJARATI_REVIEWED.json.
 *  - Glossary rows: the status becomes "Reviewed (date)" and a reviewer's Gujarati replaces the term.
 * Review the diff, then run the text tests and commit: it is one batch.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { glossaryPath, glossaryRows, parseCsv, placeholders, readReviewed, replaceTexts, textHash, withTables, writeReviewed } from './i18n-texts.mjs';

const args = process.argv.slice(2);
const folder = args.find(arg => !arg.startsWith('--') && args[args.indexOf(arg) - 1] !== '--date');
if (!folder) {
  console.error('Usage: node scripts/i18n-review-apply.mjs <folder> [--date YYYY-MM-DD] [--dry-run]');
  process.exit(2);
}
const date = args.includes('--date') ? args[args.indexOf('--date') + 1] : new Date().toISOString().slice(0, 10);
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

const changes = new Map();
const reviewedNow = new Map();
const refused = [];
const commentOnly = [];
let unchanged = 0;

withTables(({ en, gu }) => {
  for (const row of readTable(textsFile)) {
    const key = row.Key;
    if (!gu.has(key)) { refused.push(`${key}: not a Gujarati text of the app any more`); continue; }
    const current = gu.get(key);
    if (row['Gujarati draft'] !== current.trim()) { refused.push(`${key}: the draft changed since the list was made`); continue; }
    const proposed = row["Reviewer's Gujarati"];
    const comment = row.Comment;
    if (proposed === '' && comment !== '') { commentOnly.push(`${key}: ${comment}`); continue; }
    if (proposed !== '' && proposed !== current.trim()) {
      if (placeholders(proposed) !== placeholders(en.get(key) ?? '')) {
        refused.push(`${key}: placeholders differ from the English (${placeholders(en.get(key) ?? '') || 'none'}); keep them exactly`);
        continue;
      }
      changes.set(key, proposed);
      reviewedNow.set(key, textHash(proposed));
    } else {
      unchanged++;
      reviewedNow.set(key, textHash(current));
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
    at.cells[at.cells.length - 1] = `Reviewed (${date})`;
    if (row["Reviewer's Gujarati"] !== '' && row.Comment !== '') glossaryComments.push(`${row.English} (applied, with comment): ${row.Comment}`);
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
list('Refused', refused);
process.exitCode = refused.length > 0 ? 1 : 0;
