import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worsened } from './ci-lint-changed.mjs';

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
