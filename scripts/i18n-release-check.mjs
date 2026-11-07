#!/usr/bin/env node
/**
 * Release check for the Gujarati texts (docs/RELEASE_PREPARATION.md). A pull request may add an English text without a
 * Gujarati one (the app then shows the English text); a release may not. Lists every English key that has no Gujarati
 * text and exits 1 when there is any.
 *
 *   npm run i18n:release-check
 *
 * It does not check extra or stale Gujarati keys or placeholders: the compiler and src/i18n/__tests__ do.
 */
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(root, 'src', 'i18n', 'locales');

const sources = dir =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.ts$/.test(name) ? [path] : [];
  });

/** Every key path that ends in a text or a plural pair. */
function keyPaths(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) => {
    if (typeof value === 'string') return [`${prefix}${key}`];
    if (value && typeof value === 'object' && typeof value.other === 'string') return [`${prefix}${key}`];
    return value && typeof value === 'object' ? keyPaths(value, `${prefix}${key}.`) : [];
  });
}

const lookup = (table, path) => path.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), table);

const work = mkdtempSync(join(tmpdir(), 'i18n-release-check-'));
try {
  // The locale files are TypeScript with extensionless imports: compile them to CommonJS in a scratch folder.
  for (const file of sources(localesDir)) {
    const out = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    const target = join(work, relative(localesDir, file).replace(/\.ts$/, '.js'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, out.outputText);
  }
  const load = createRequire(join(work, 'x.js'));
  const en = load('./en/index.js').en;
  const gu = load('./gu/index.js').gu;
  const missing = keyPaths(en).filter(path => lookup(gu, path) === undefined);
  if (missing.length > 0) {
    console.error(`${missing.length} English text(s) have no Gujarati text. Add the drafts from docs/GUJARATI_GLOSSARY.md:`);
    for (const path of missing) console.error(`  ${path}`);
    process.exitCode = 1;
  } else {
    console.log('Every English text has a Gujarati text.');
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
