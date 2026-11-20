#!/usr/bin/env node
// CI step "Lint changed files (no new warnings)" (docs/CODE_GUIDE.md, WH-273): a pull request adds no lint warning in the
// files it changes. Each changed .ts/.tsx file is linted at the head and, where it has warnings, at the base commit; the step
// fails on any error and on any file with more warnings than it had at the base. A file with old warnings that does not get
// worse passes, so touching such a file is allowed; the repository-wide ratchet (--max-warnings in ci.yml) still counts them.
//
// usage: node scripts/ci-lint-changed.mjs <file with one changed path per line> <base commit>
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHUNK = 100;

// results: ESLint's JSON results of the head; baseWarnings: { path: warnings at the base }. Returns the files that got worse.
export function worsened(results, baseWarnings) {
  const worse = [];
  for (const result of results) {
    const was = baseWarnings[result.filePath] ?? 0;
    if (result.warningCount > was) worse.push({ file: result.filePath, now: result.warningCount, was });
  }
  return worse;
}

function eslintJson(args, input) {
  const run = spawnSync('npx', ['--no-install', 'eslint', '--no-warn-ignored', '-f', 'json', ...args], {
    input,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  // Exit 0 = clean, 1 = lint errors; anything else (2, a signal) is a broken run and must not pass.
  if (run.error || (run.status !== 0 && run.status !== 1)) {
    throw new Error(`eslint did not run (status ${run.status}): ${run.error?.message ?? run.stderr.slice(-400)}`);
  }
  return JSON.parse(run.stdout);
}

function baseSource(base, file) {
  const show = spawnSync('git', ['show', `${base}:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return show.status === 0 ? show.stdout : null; // null: the file is new in this pull request
}

function main() {
  const [listFile, base] = process.argv.slice(2);
  if (!listFile || !base) throw new Error('usage: node scripts/ci-lint-changed.mjs <list file> <base commit>');
  const files = readFileSync(listFile, 'utf8').split('\n').filter(Boolean);
  if (files.length === 0) {
    console.log('No TypeScript files changed.');
    return 0;
  }

  const results = [];
  for (let i = 0; i < files.length; i += CHUNK) results.push(...eslintJson(['--', ...files.slice(i, i + CHUNK)]));

  const cwd = process.cwd();
  const relative = path => (path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path);
  let errors = 0;
  const baseWarnings = {};
  for (const result of results) {
    errors += result.errorCount;
    if (result.warningCount === 0) continue;
    const source = baseSource(base, relative(result.filePath));
    if (source === null) {
      baseWarnings[result.filePath] = 0;
    } else {
      const [old] = eslintJson(['--stdin', '--stdin-filename', result.filePath], source);
      baseWarnings[result.filePath] = old?.warningCount ?? 0;
    }
  }

  const total = results.reduce((sum, result) => sum + result.warningCount, 0);
  const worse = worsened(results, baseWarnings);
  console.log(`${files.length} changed files, ${total} warnings in them, ${errors} errors, ${worse.length} files with more warnings than at the base.`);
  for (const { file, now, was } of worse) console.log(`::error file=${relative(file)}::${now} lint warnings, ${was} at the base: this pull request adds ${now - was}`);
  if (errors > 0) console.log('::error::ESLint errors in the changed files');
  return errors > 0 || worse.length > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 2;
  }
}
