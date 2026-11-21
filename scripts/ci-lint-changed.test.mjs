import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baseSource, changedFilesFromGit, parseChangedFiles, resolveBase, worsened } from './ci-lint-changed.mjs';

function git(args, cwd) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(run.status, 0, `git ${args.join(' ')} failed: ${run.stderr}`);
  return run.stdout.trim();
}

// WH-273: the CI step fails a changed file only when it has more lint warnings than it had at the base commit.
test('a file with the same or fewer warnings than at the base passes', () => {
  const results = [
    { filePath: '/r/a.ts', warningCount: 5 },
    { filePath: '/r/b.ts', warningCount: 1 },
    { filePath: '/r/c.ts', warningCount: 0 },
  ];
  assert.deepEqual(worsened(results, { '/r/a.ts': 5, '/r/b.ts': 9 }), []);
});

test('a file with more warnings than at the base is named, with both counts', () => {
  const results = [
    { filePath: '/r/a.ts', warningCount: 6 },
    { filePath: '/r/b.ts', warningCount: 2 },
  ];
  assert.deepEqual(worsened(results, { '/r/a.ts': 5, '/r/b.ts': 2 }), [{ file: '/r/a.ts', now: 6, was: 5 }]);
});

test('a file that is new in the pull request has no base warnings, so any warning counts', () => {
  assert.deepEqual(worsened([{ filePath: '/r/new.ts', warningCount: 1 }], { '/r/new.ts': 0 }), [{ file: '/r/new.ts', now: 1, was: 0 }]);
  assert.deepEqual(worsened([{ filePath: '/r/new.ts', warningCount: 1 }], {}), [{ file: '/r/new.ts', now: 1, was: 0 }]);
});

// WH-280 (1): a renamed file is compared against its old path at the base commit, not treated as a new file with 0 base warnings.
test('a renamed file reads its base source from the old path rather than treating the new path as a brand-new file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wh280-rename-'));
  try {
    git(['init', '-b', 'main'], dir);
    git(['config', 'user.email', 'test@example.com'], dir);
    git(['config', 'user.name', 'Test'], dir);
    mkdirSync(join(dir, 'src'));
    const oldContent = '// warning 1\n// warning 2\nexport const value = 1;\n';
    writeFileSync(join(dir, 'src/oldName.ts'), oldContent);
    git(['add', 'src/oldName.ts'], dir);
    git(['commit', '-m', 'base with existing warnings'], dir);
    const base = git(['rev-parse', 'HEAD'], dir);

    git(['mv', 'src/oldName.ts', 'src/newName.ts'], dir);
    git(['commit', '-m', 'move file without adding warnings'], dir);

    const entries = changedFilesFromGit(base, dir);
    assert.deepEqual(entries, [{ file: 'src/newName.ts', baseFile: 'src/oldName.ts' }]);
    assert.equal(baseSource(base, 'src/newName.ts', dir), null, 'the new path did not exist at the base');
    assert.equal(baseSource(base, entries[0].baseFile, dir), oldContent, 'the old path gives the base source');

    // Also checks parseChangedFiles directly for R<score>, M, A, and plain paths.
    assert.deepEqual(
      parseChangedFiles('R095\tsrc/before.tsx\tsrc/after.tsx\nM\tsrc/kept.ts\nA\tsrc/added.ts\nsrc/plain.ts\n'),
      [
        { file: 'src/after.tsx', baseFile: 'src/before.tsx' },
        { file: 'src/kept.ts', baseFile: 'src/kept.ts' },
        { file: 'src/added.ts', baseFile: 'src/added.ts' },
        { file: 'src/plain.ts', baseFile: 'src/plain.ts' },
      ],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// WH-280 (2): on a pull-request merge commit, HEAD^1 is the current main commit GitHub merged against, so a re-run after
// main moved past the event payload's original BASE_SHA does not include files that only main changed since.
test('resolveBase uses HEAD^1 of the pull-request merge commit so main commits after the original base are excluded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wh280-base-'));
  try {
    git(['init', '-b', 'main'], dir);
    git(['config', 'user.email', 'test@example.com'], dir);
    git(['config', 'user.name', 'Test'], dir);
    writeFileSync(join(dir, 'shared.ts'), 'export const s = 1;\n');
    git(['add', 'shared.ts'], dir);
    git(['commit', '-m', 'initial base when PR opened'], dir);
    const staleEventBase = git(['rev-parse', 'HEAD'], dir);

    // Pull-request branch changes only pr.ts.
    git(['checkout', '-b', 'pr'], dir);
    writeFileSync(join(dir, 'pr.ts'), 'export const pr = 1;\n');
    git(['add', 'pr.ts'], dir);
    git(['commit', '-m', 'PR change'], dir);

    // Meanwhile main moves ahead and changes mainOnly.ts (with warnings).
    git(['checkout', 'main'], dir);
    writeFileSync(join(dir, 'mainOnly.ts'), 'export const m = 1;\n');
    git(['add', 'mainOnly.ts'], dir);
    git(['commit', '-m', 'main moved ahead'], dir);
    const currentMain = git(['rev-parse', 'HEAD'], dir);

    // GitHub Actions checks out the merge commit of currentMain (HEAD^1) and pr (HEAD^2).
    git(['checkout', '--detach', currentMain], dir);
    git(['merge', '--no-ff', 'pr', '-m', 'Merge pr into main'], dir);

    // Diffing against the stale event BASE_SHA would falsely include mainOnly.ts.
    const staleDiff = changedFilesFromGit(staleEventBase, dir).map(e => e.file).sort();
    assert.deepEqual(staleDiff, ['mainOnly.ts', 'pr.ts']);

    // resolveBase() picks HEAD^1 (currentMain), so only the PR's file is linted.
    const base = resolveBase(dir);
    assert.equal(base, currentMain);
    assert.notEqual(base, staleEventBase);
    assert.deepEqual(changedFilesFromGit(base, dir), [{ file: 'pr.ts', baseFile: 'pr.ts' }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
