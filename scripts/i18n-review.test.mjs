import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, beforeEach } from 'node:test';

// WH-144 and WH-149: the Gujarati review sheet, its importer and the release / public checks. The scripts find their
// files from their own location, so each test runs a copy of them inside a small fixture app (two namespaces, a
// plural, a placeholder, a quoted text, and a glossary), never inside the real repository.
const scripts = ['i18n-texts.mjs', 'i18n-release-check.mjs', 'i18n-review-sheet.mjs', 'i18n-review-apply.mjs'];
const realRoot = new URL('..', import.meta.url).pathname;
const base = mkdtempSync(join(tmpdir(), 'i18n-review-'));
after(() => rmSync(base, { recursive: true, force: true }));

const EN_COMMON = `export const common = {
  save: 'Save',
  welcome: 'Hello {{name}}',
  items: { one: '{{count}} item', other: '{{count}} items' },
  note: 'Say "hi", then go',
};
`;
const GU_COMMON = `export const common = {
  save: 'સાચવો',
  welcome: 'નમસ્તે {{name}}',
  items: { one: '{{count}} વસ્તુ', other: '{{count}} વસ્તુઓ' },
  note: 'કહો "હાય", પછી જાઓ',
};
`;
const EN_GRN = `export const grn = { title: 'Goods received', extra: 'Only in English' };\n`;
const GU_GRN = `export const grn = { title: 'માલ આવક' };\n`;
const GLOSSARY = `# Glossary

## Words

| English | Gujarati | Treatment | Basis |
|---|---|---|---|
| Save | સાચવો | translate | Draft |
| Goods received | માલ આવક | translate | Draft |
`;

let app;
let counter = 0;
const write = (path, text) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
};
function makeApp({ withMissing = true } = {}) {
  app = join(base, `app-${counter++}`);
  mkdirSync(join(app, 'scripts'), { recursive: true });
  for (const name of scripts) copyFileSync(join(realRoot, 'scripts', name), join(app, 'scripts', name));
  symlinkSync(join(realRoot, 'node_modules'), join(app, 'node_modules'));
  const locales = join(app, 'src/i18n/locales');
  write(join(locales, 'en/common.ts'), EN_COMMON);
  write(join(locales, 'en/grn.ts'), withMissing ? EN_GRN : `export const grn = { title: 'Goods received' };\n`);
  write(join(locales, 'en/index.ts'), `import { common } from './common';\nimport { grn } from './grn';\nexport const en = { common, grn };\n`);
  write(join(locales, 'gu/common.ts'), GU_COMMON);
  write(join(locales, 'gu/grn.ts'), GU_GRN);
  write(join(locales, 'gu/index.ts'), `import { common } from './common';\nimport { grn } from './grn';\nexport const gu = { common, grn };\n`);
  write(join(app, 'docs/GUJARATI_GLOSSARY.md'), GLOSSARY);
}
const run = (script, ...args) => spawnSync('node', [join(app, 'scripts', script), ...args], { cwd: app, encoding: 'utf8' });
const sheet = (...args) => run('i18n-review-sheet.mjs', '--out', join(app, 'review'), '--date', '2026-12-01', ...args);
const apply = (...args) => run('i18n-review-apply.mjs', join(app, 'review'), '--date', '2026-12-02', ...args);
const guCommon = () => readFileSync(join(app, 'src/i18n/locales/gu/common.ts'), 'utf8');
const reviewedRecord = () => JSON.parse(readFileSync(join(app, 'docs/GUJARATI_REVIEWED.json'), 'utf8'));
const textsPath = () => join(app, 'review/Texts.csv');
/** Fill a cell of the exported Texts.csv for one key: column 4 is the reviewer's Gujarati, column 5 the comment. */
function editRow(key, { proposed, comment, draft }) {
  const lines = readFileSync(textsPath(), 'utf8').split('\r\n');
  const index = lines.findIndex(line => line.startsWith(`${key},`));
  assert.ok(index > 0, `row ${key} is in the sheet`);
  const quote = text => `"${text.replace(/"/g, '""')}"`;
  const cells = lines[index].match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(cell => cell.replace(/,$/, ''));
  if (draft !== undefined) cells[3] = quote(draft);
  if (proposed !== undefined) cells[4] = quote(proposed);
  if (comment !== undefined) cells[5] = quote(comment);
  lines[index] = cells.join(',');
  writeFileSync(textsPath(), lines.join('\r\n'));
}

beforeEach(() => makeApp());

test('the sheet is UTF-8 with a BOM, one row per text and per plural form, sorted by screen, English beside the draft', () => {
  const result = sheet();
  assert.equal(result.status, 0, result.stderr);
  const bytes = readFileSync(textsPath());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'a byte-order mark first, so Excel reads the Gujarati');
  const lines = bytes.toString('utf8').replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
  assert.equal(lines[0], "Key,Screen,English,Gujarati draft,Reviewer's Gujarati,Comment");
  const keys = lines.slice(1).map(line => line.split(',')[0]);
  assert.deepEqual(keys, ['grn.title', 'common.save', 'common.welcome', 'common.items.one', 'common.items.other', 'common.note'], 'sorted by screen (GRN before Shared), table order inside a screen');
  assert.equal(keys.length, 6, 'one row per form: items.one and items.other');
  assert.ok(lines.some(line => line.startsWith('common.note,Shared: common words,"Say ""hi"", then go","કહો ""હાય"", પછી જાઓ",,')), 'quotes and commas are escaped');
  assert.ok(!keys.includes('grn.extra'), 'an English-only key has no draft to review');
  const glossary = readFileSync(join(app, 'review/Glossary.csv'), 'utf8');
  assert.equal(glossary.charCodeAt(0), 0xfeff);
  assert.match(glossary, /Words,Save,સાચવો,translate,Draft,,/);
});

test('round trip: the unedited sheet applies with nothing changed, records every text as reviewed and leaves the locale files alone', () => {
  sheet();
  const before = guCommon();
  const result = apply();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /0 text\(s\) changed, 6 kept, 2 glossary row\(s\) reviewed/);
  assert.equal(guCommon(), before);
  const record = reviewedRecord();
  assert.equal(record.reviewedOn, '2026-12-02');
  assert.equal(Object.keys(record.texts).length, 6);
  assert.match(readFileSync(join(app, 'docs/GUJARATI_GLOSSARY.md'), 'utf8'), /\| Save \| સાચવો \| translate \| Reviewed \(2026-12-02\) \|/);
});

test('a correction is written into the Gujarati file, only that text, and recorded as reviewed', () => {
  sheet();
  editRow('common.save', { proposed: 'સેવ કરો' });
  editRow('common.items.other', { proposed: '{{count}} ચીજો' });
  const result = apply();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /2 text\(s\) changed, 4 kept/);
  const text = guCommon();
  assert.match(text, /save: 'સેવ કરો',/);
  assert.match(text, /other: '\{\{count\}\} ચીજો'/);
  assert.match(text, /one: '\{\{count\}\} વસ્તુ'/, 'the other plural form is untouched');
  assert.match(text, /welcome: 'નમસ્તે \{\{name\}\}',/);
  assert.equal(Object.keys(reviewedRecord().texts).length, 6);
  // The corrected text counts as reviewed: the public check passes.
  const check = run('i18n-release-check.mjs', '--public');
  assert.equal(check.status, 1, 'grn.extra is still missing');
});

test('the importer reads a sheet saved by Excel: no BOM, ";" separators, CRLF', () => {
  sheet();
  const rows = readFileSync(textsPath(), 'utf8').replace(/^\uFEFF/, '');
  // Re-save as a ";" file without the BOM, with a correction typed into the reviewer's column.
  const semicolons = rows.split('\r\n').filter(Boolean).map(line => {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(cell => cell.replace(/,$/, ''));
    if (cells[0] === 'common.save') cells[4] = 'સેવ';
    return cells.join(';');
  });
  writeFileSync(textsPath(), `${semicolons.join('\r\n')}\r\n`);
  const result = apply();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(guCommon(), /save: 'સેવ',/);
});

test('a stale row is refused: the draft changed in the app after the sheet was made', () => {
  sheet();
  writeFileSync(join(app, 'src/i18n/locales/gu/common.ts'), guCommon().replace("'સાચવો'", "'બચાવો'"));
  editRow('common.save', { proposed: 'સેવ કરો' });
  const result = apply();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Refused \(1\)/);
  assert.match(result.stdout, /common\.save: the draft changed since the list was made/);
  assert.match(guCommon(), /save: 'બચાવો'/, 'the newer wording is not overwritten by the reviewer\'s answer');
  assert.ok(!('common.save' in reviewedRecord().texts), 'a refused text is not recorded as reviewed');
});

test('a correction that drops or renames a {{placeholder}} is refused and changes nothing', () => {
  sheet();
  editRow('common.welcome', { proposed: 'નમસ્તે {{naam}}' });
  const result = apply();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /common\.welcome: placeholders differ from the English \(name\)/);
  assert.match(guCommon(), /welcome: 'નમસ્તે \{\{name\}\}'/);
  assert.ok(!('common.welcome' in reviewedRecord().texts));
});

test('a comment with no new text is listed for Product and stays unreviewed', () => {
  sheet();
  editRow('grn.title', { comment: 'Use the word for receipt' });
  const result = apply();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Comments without new text, for Product \(these stay unreviewed\) \(1\):\n {2}grn\.title: Use the word for receipt/);
  assert.ok(!('grn.title' in reviewedRecord().texts));
  assert.ok('common.save' in reviewedRecord().texts);
});

test('--dry-run reports the change and writes nothing', () => {
  sheet();
  editRow('common.save', { proposed: 'સેવ કરો' });
  const before = guCommon();
  const result = apply('--dry-run');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\[dry run\] 1 text\(s\) changed/);
  assert.equal(guCommon(), before);
  assert.ok(!existsSync(join(app, 'docs/GUJARATI_REVIEWED.json')));
  assert.match(readFileSync(join(app, 'docs/GUJARATI_GLOSSARY.md'), 'utf8'), /Draft \|/);
});

test('a sheet reviewed once is not listed again, only an edited text is', () => {
  sheet();
  apply();
  writeFileSync(join(app, 'src/i18n/locales/gu/common.ts'), guCommon().replace("'સાચવો'", "'બચાવો'"));
  const result = sheet();
  assert.equal(result.status, 0, result.stderr);
  const keys = readFileSync(textsPath(), 'utf8').split('\r\n').slice(1).filter(Boolean).map(line => line.split(',')[0]);
  assert.deepEqual(keys, ['common.save']);
});

test('i18n:release-check fails on an English text with no Gujarati and names it; i18n:public-check fails on unreviewed ones', () => {
  const missing = run('i18n-release-check.mjs');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /1 English text\(s\) have no Gujarati text/);
  assert.match(missing.stderr, /\n {2}grn\.extra\n/);
  assert.match(missing.stdout, /6 Gujarati text\(s\) are not reviewed/);
  assert.match(missing.stdout, /does not block a tag/);

  makeApp({ withMissing: false });
  const tag = run('i18n-release-check.mjs');
  assert.equal(tag.status, 0, 'unreviewed Gujarati does not block a tag');
  assert.match(tag.stdout, /Every English text has a Gujarati text\./);
  const publicRun = run('i18n-release-check.mjs', '--public');
  assert.equal(publicRun.status, 1, 'going public needs every text reviewed');
  assert.match(publicRun.stderr, /The first public release needs every text reviewed/);
  assert.match(publicRun.stderr, /\n {2}common\.save\n/);
});

test('i18n:public-check passes once every text is reviewed, and fails again when a reviewed text is edited', () => {
  makeApp({ withMissing: false });
  sheet();
  assert.equal(apply().status, 0);
  const done = run('i18n-release-check.mjs', '--public');
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /Every Gujarati text is reviewed\./);
  writeFileSync(join(app, 'src/i18n/locales/gu/grn.ts'), `export const grn = { title: 'માલની આવક' };\n`);
  const edited = run('i18n-release-check.mjs', '--public');
  assert.equal(edited.status, 1);
  assert.match(edited.stderr, /1 Gujarati text\(s\) are not reviewed/);
  assert.match(edited.stderr, /\n {2}grn\.title\n/);
});
