#!/usr/bin/env node
/**
 * Writes the list a native Gujarati speaker reviews once before the first public release (WH-149).
 *
 *   node scripts/i18n-review-sheet.mjs [--out <folder>] [--date YYYY-MM-DD] [--all]
 *
 * Writes <folder>/Texts.csv (one row per Gujarati text: Key, Screen, English, Gujarati draft, Reviewer's Gujarati,
 * Comment; sorted by screen) and <folder>/Glossary.csv (the rows of docs/GUJARATI_GLOSSARY.md). Both are UTF-8 with a
 * byte-order mark, so a spreadsheet program opens them directly; the reviewer saves them back as CSV UTF-8 (or
 * pastes the columns into an .xlsx sheet and exports). The default folder is gujarati-review-<date> in the current
 * folder. Only texts not yet reviewed are listed (docs/GUJARATI_REVIEWED.json); --all lists every text. A plural text
 * has one row per form (key.one, key.other). It also writes <folder>/Reviewer.csv with the headers "Reviewer name" and
 * "Reviewed on" (YYYY-MM-DD) and one empty row: the reviewer fills both, and the import records texts as reviewed only
 * when both are filled. Apply the returned files with scripts/i18n-review-apply.mjs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { csvLine, glossaryPath, glossaryRows, readReviewed, textHash, withTables } from './i18n-texts.mjs';

/** Screen for a key that the namespace alone does not name: longest matching key prefix wins. */
const SCREEN_BY_KEY = {};
/** Namespace -> screen label. A namespace not listed shows under its own name. */
const SCREEN_BY_NAMESPACE = {
  common: 'Shared: common words',
  components: 'Shared: components',
  errors: 'Shared: error messages',
  validation: 'Shared: form checks',
  filters: 'Shared: filters and sorting',
  lists: 'Shared: lists',
  nav: 'Shared: navigation',
  central: 'Sign-in: facilities',
  auth: 'Sign-in',
  grn: 'GRN (goods received)',
  dispatch: 'Dispatch',
  invoice: 'Invoices',
  orders: 'Orders',
  customers: 'Customers',
  items: 'Items',
  pricing: 'Rates',
  reports: 'Reports',
  settings: 'Settings',
  numbering: 'Settings: numbering',
  users: 'Users',
  sensors: 'Sensors',
};
const screenOf = key => {
  const prefix = Object.keys(SCREEN_BY_KEY).filter(p => key.startsWith(p)).sort((a, b) => b.length - a.length)[0];
  return prefix ? SCREEN_BY_KEY[prefix] : SCREEN_BY_NAMESPACE[key.split('.')[0]] ?? key.split('.')[0];
};

const args = process.argv.slice(2);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const date = option('--date') ?? new Date().toISOString().slice(0, 10);
const out = resolve(option('--out') ?? `gujarati-review-${date}`);
const reviewed = readReviewed();

const rows = withTables(({ en, gu }) =>
  [...gu]
    .filter(([key, text]) => args.includes('--all') || reviewed.texts[key] !== textHash(text))
    .map(([key, text], order) => ({ key, screen: screenOf(key), english: en.get(key) ?? '', draft: text, order })),
).sort((a, b) => (a.screen < b.screen ? -1 : a.screen > b.screen ? 1 : a.order - b.order));

mkdirSync(out, { recursive: true });
const BOM = '\uFEFF';
writeFileSync(
  join(out, 'Texts.csv'),
  `${BOM}${[csvLine(['Key', 'Screen', 'English', 'Gujarati draft', "Reviewer's Gujarati", 'Comment']), ...rows.map(r => csvLine([r.key, r.screen, r.english, r.draft, '', '']))].join('\r\n')}\r\n`,
);

const glossary = glossaryRows(readFileSync(glossaryPath, 'utf8').split('\n'));
writeFileSync(
  join(out, 'Glossary.csv'),
  `${BOM}${[
    csvLine(['Section', 'English', 'Gujarati', 'Treatment', 'Status', "Reviewer's Gujarati", 'Comment']),
    ...glossary.map(({ section, cells }) => csvLine([section, cells[0], cells[1], cells.length > 3 ? cells[2] : '', cells[cells.length - 1], '', ''])),
  ].join('\r\n')}\r\n`,
);
writeFileSync(join(out, 'Reviewer.csv'), `${BOM}${[csvLine(['Reviewer name', 'Reviewed on (YYYY-MM-DD)']), csvLine(['', ''])].join('\r\n')}\r\n`);
console.log(`${rows.length} text(s) -> ${join(out, 'Texts.csv')}; ${glossary.length} glossary row(s) -> ${join(out, 'Glossary.csv')}`);
