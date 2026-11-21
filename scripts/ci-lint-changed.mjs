#!/usr/bin/env node
// CI step "Lint changed files (no new warnings)" (docs/CODE_GUIDE.md, WH-273, WH-280): a pull request adds no lint warning in the
// files it changes. Each changed .ts/.tsx file is linted at the head and, where it has warnings, at the base commit (using its old
// path when git diff --name-status -M reports a rename); the step fails on any error and on any file with more warnings than it had
// at the base. A file with old warnings that does not get worse passes, so touching or moving such a file is allowed; the
// repository-wide ratchet (--max-warnings in ci.yml) still counts them.
//
// usage: node scripts/ci-lint-changed.mjs <file with git diff --name-status -M (or one path) per line> [base commit]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHUNK = 100;

// Parses lines from `git diff --name-status -M --diff-filter=d` (or plain path lines) into [{ file, baseFile }].
// For a rename/copy `R100\told.ts\tnew.ts`, `file` is `new.ts` (linted at HEAD) and `baseFile` is `old.ts` (read at base).
export function parseChangedFiles(text) {
  const entries = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length >= 3 && /^[RC]\d*$/.test(parts[0])) {
      entries.push({ file: parts[2], baseFile: parts[1] });
    } else if (parts.length === 2 && /^[A-Z]\d*$/.test(parts[0])) {
      entries.push({ file: parts[1], baseFile: parts[1] });
    } else {
      entries.push({ file: line, baseFile: line });
    }
  }
  return entries;
}

// Resolves `HEAD^1` (the base parent of GitHub's pull-request merge commit, immune to stale event BASE_SHA after main moves).
export function resolveBase(cwd = process.cwd()) {
  const rev = spawnSync('git', ['rev-parse', '--verify', 'HEAD^1'], { cwd, encoding: 'utf8' });
  if (rev.error || rev.status !== 0) {
    throw new Error(`git rev-parse HEAD^1 failed (status ${rev.status}): ${rev.error?.message ?? rev.stderr.trim()}`);
  }
  return rev.stdout.trim();
}

// Lists non-deleted .ts/.tsx files changed between `base` and `HEAD` with rename detection (`--name-status -M`).
export function changedFilesFromGit(base = resolveBase(), cwd = process.cwd()) {
  const diff = spawnSync('git', ['diff', '--name-status', '-M', '--diff-filter=d', base, 'HEAD', '--', '*.ts', '*.tsx'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (diff.error || diff.status !== 0) {
    throw new Error(`git diff failed (status ${diff.status}): ${diff.error?.message ?? diff.stderr.trim()}`);
  }
  return parseChangedFiles(diff.stdout);
}

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

export function baseSource(base, file, cwd = process.cwd()) {
  const show = spawnSync('git', ['show', `${base}:${file}`], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return show.status === 0 ? show.stdout : null; // null: the file is new in this pull request
}

function main() {
  const [listFile, baseArg] = process.argv.slice(2);
  if (!listFile) throw new Error('usage: node scripts/ci-lint-changed.mjs <list file> [base commit]');
  const base = baseArg || resolveBase();
  const entries = parseChangedFiles(readFileSync(listFile, 'utf8'));
  if (entries.length === 0) {
    console.log('No TypeScript files changed.');
    return 0;
  }

  const files = entries.map(entry => entry.file);
  const basePathByFile = new Map(entries.map(({ file, baseFile }) => [file, baseFile]));
  const results = [];
  for (let i = 0; i < files.length; i += CHUNK) results.push(...eslintJson(['--', ...files.slice(i, i + CHUNK)]));

  const cwd = process.cwd();
  const relative = path => (path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path);
  let errors = 0;
  const baseWarnings = {};
  for (const result of results) {
    errors += result.errorCount;
    if (result.warningCount === 0) continue;
    const rel = relative(result.filePath);
    const source = baseSource(base, basePathByFile.get(rel) ?? rel);
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
