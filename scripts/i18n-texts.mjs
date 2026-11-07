/**
 * Shared helpers for the Gujarati review scripts (WH-149) and the release check (WH-144): load the English and Gujarati
 * text tables, list every text as a flat key, find a text in its source file, and record which texts a native speaker
 * has reviewed (docs/GUJARATI_REVIEWED.json).
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const localesDir = join(root, 'src', 'i18n', 'locales');
export const reviewedPath = join(root, 'docs', 'GUJARATI_REVIEWED.json');
export const glossaryPath = join(root, 'docs', 'GUJARATI_GLOSSARY.md');

/** A gu file whose texts sit under another namespace (it is spread into that namespace's file). */
const NAMESPACE_OF_FILE = { pricingEdit: 'pricing' };

const sources = dir =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.ts$/.test(name) ? [path] : [];
  });

/** Every text as [key, string]. A plural text gives one key per form: `grn.items.one`, `grn.items.other`. */
export function flatten(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) => {
    if (typeof value === 'string') return [[`${prefix}${key}`, value]];
    if (value && typeof value === 'object' && typeof value.other === 'string') {
      return Object.entries(value).filter(([, form]) => typeof form === 'string').map(([name, form]) => [`${prefix}${key}.${name}`, form]);
    }
    return value && typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [];
  });
}

/** Compile the locale files in a scratch folder, call `fn({ en, gu })` with the flat maps, then clean up. */
export function withTables(fn) {
  const work = mkdtempSync(join(tmpdir(), 'i18n-texts-'));
  try {
    for (const file of sources(localesDir)) {
      const out = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
      const target = join(work, relative(localesDir, file).replace(/\.ts$/, '.js'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, out.outputText);
    }
    const load = createRequire(join(work, 'x.js'));
    return fn({ en: new Map(flatten(load('./en/index.js').en)), gu: new Map(flatten(load('./gu/index.js').gu)) });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export const placeholders = text => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(match => match[1]).sort().join(',');
export const textHash = text => createHash('sha1').update(text).digest('hex').slice(0, 10);

/** { reviewedOn, texts: { key: hash } }. A text counts as reviewed only while its current wording has the recorded hash. */
export function readReviewed() {
  try {
    return JSON.parse(readFileSync(reviewedPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { reviewedOn: null, texts: {} };
    throw error;
  }
}

export function writeReviewed(record) {
  const texts = Object.fromEntries(Object.entries(record.texts).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(reviewedPath, `${JSON.stringify({ reviewedOn: record.reviewedOn, texts }, null, 2)}\n`);
}

/** Keys of gu whose current text was not reviewed, in table order. */
export const unreviewedKeys = (gu, reviewed) => [...gu].filter(([key, text]) => reviewed.texts[key] !== textHash(text)).map(([key]) => key);

/** Where each flat key lives: Map key -> { file, path } (path inside the file's exported object). */
export function locateTexts() {
  const found = new Map();
  for (const file of sources(join(localesDir, 'gu'))) {
    const name = file.replace(/^.*\/|\.ts$/g, '');
    if (name === 'index') continue;
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2020, true);
    const namespace = NAMESPACE_OF_FILE[name] ?? name;
    const walk = (node, path) => {
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name) ? prop.name.text : null;
        if (key === null) continue;
        const next = [...path, key];
        if (ts.isObjectLiteralExpression(prop.initializer)) walk(prop.initializer, next);
        else found.set(`${namespace}.${next.join('.')}`, { file, path: next, node: prop.initializer, sf });
      }
    };
    sf.forEachChild(top => {
      if (!ts.isVariableStatement(top)) return;
      for (const decl of top.declarationList.declarations) {
        if (decl.name.getText(sf) === name && decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) walk(decl.initializer, []);
      }
    });
  }
  return found;
}

const quote = text => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

/**
 * Replace texts in the gu source files. `changes` is Map flatKey -> new string. Plural forms (`key.one`) are found as
 * the property `one` of the plural object, which locateTexts() walks like any other object. Returns the files written.
 */
export function replaceTexts(changes) {
  const located = locateTexts();
  const byFile = new Map();
  for (const [key, text] of changes) {
    const at = located.get(key);
    if (!at) throw new Error(`No source text found for ${key}`);
    byFile.set(at.file, [...(byFile.get(at.file) ?? []), { at, text }]);
  }
  for (const [file, edits] of byFile) {
    let source = readFileSync(file, 'utf8');
    for (const { at, text } of edits.sort((a, b) => b.at.node.getStart(b.at.sf) - a.at.node.getStart(a.at.sf))) {
      source = source.slice(0, at.node.getStart(at.sf)) + quote(text) + source.slice(at.node.getEnd());
    }
    writeFileSync(file, source);
  }
  return [...byFile.keys()];
}

/** Rows of the glossary tables whose last column is "Basis": { line, section, cells, columns }. */
export function glossaryRows(lines) {
  const rows = [];
  let section = '';
  let basis = false;
  lines.forEach((line, index) => {
    if (/^#{2,}\s/.test(line)) section = line.replace(/^#+\s*/, '');
    if (!line.startsWith('|')) return;
    const cells = line.slice(1, line.lastIndexOf('|')).split('|').map(cell => cell.trim());
    if (/^-+$/.test(cells[0] ?? '')) return;
    if (cells[0] === 'English' || cells[0] === '') {
      basis = cells[cells.length - 1] === 'Basis';
      return;
    }
    if (basis) rows.push({ line: index, section, cells });
  });
  return rows;
}

/** RFC 4180 CSV. */
export const csvLine = cells => cells.map(cell => (/[",\n\r;]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',');
export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}
