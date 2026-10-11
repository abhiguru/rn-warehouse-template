import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const directory = new URL('../.github/workflows/', import.meta.url);
const workflows = readdirSync(directory).map(file => [file, readFileSync(new URL(file, directory), 'utf8').split('\n')]);
const dependabot = readFileSync(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');

// Review 2026-10-10, M9-5.
test('workflow actions are referenced by commit, with the release in a comment', () => {
  let count = 0;
  for (const [file, lines] of workflows) {
    for (const line of lines) {
      if (!/^\s*(?:- )?uses:/.test(line)) continue;
      // A tag such as @v7 can be moved to other code; a commit cannot. Dependabot
      // (github-actions) updates the hash and the comment together.
      assert.match(line, /uses: [a-z0-9-]+\/[a-z0-9-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `${file}: ${line.trim()}`);
      count += 1;
    }
  }
  assert.ok(count >= 12, 'workflow steps were read');
  assert.match(dependabot, /package-ecosystem: github-actions/);
});

// Review 2026-10-10, X5-18 / M9-5: no job leaves the token in .git/config for
// the install scripts and npx tools that run after the checkout.
test('every checkout drops its credentials, and the token is read-only', () => {
  let count = 0;
  for (const [file, lines] of workflows) {
    assert.match(lines.join('\n'), /^permissions:\n {2}contents: read\n/m, `${file}: workflow permissions`);
    lines.forEach((line, index) => {
      if (!/uses: actions\/checkout@/.test(line)) return;
      const indent = line.match(/^\s*(?:- )?/)[0].length;
      const step = [];
      for (const next of lines.slice(index + 1)) {
        if (next.trim() && next.match(/^\s*/)[0].length < indent) break;
        if (next.trim() && next.match(/^\s*/)[0].length === indent - 2 && next.trimStart().startsWith('- ')) break;
        step.push(next);
      }
      assert.match(step.join('\n'), /^\s+with:\n(?:\s+.*\n)*?\s+persist-credentials: false$/m, `${file}:${index + 1}`);
      count += 1;
    });
  }
  assert.equal(count, 5, 'every checkout was read');
});

// Review 2026-10-10, X5-15: an ignore entry with a name alone can also stop
// Dependabot's security pull request for that package; one with update-types
// stops version updates only.
test('every Dependabot ignore entry names the update types it ignores', () => {
  const lines = dependabot.split('\n');
  const names = lines.flatMap((line, index) => (/^\s+- dependency-name:/.test(line) ? [index] : []));
  assert.ok(names.length >= 33, 'ignore entries were read');
  for (const index of names) {
    assert.match(lines[index + 1], /^\s+update-types: \["version-update:semver-(?:major|minor|patch)"(?:, "version-update:semver-(?:major|minor|patch)")*\]$/, lines[index].trim());
  }
  assert.doesNotMatch(dependabot, /^\s+versions:/m);
});

// A self-hosted label written into a workflow would leave that job waiting for
// ever in every fork. The one job that may run on such a runner takes it from a
// repository variable and falls back to a hosted runner.
test('no workflow names a self-hosted runner; the Android artifact job takes its runner from a repository variable', () => {
  let count = 0;
  for (const [file, lines] of workflows) {
    for (const line of lines.filter(text => /^\s*runs-on:/.test(text))) {
      assert.doesNotMatch(line, /self-hosted/, `${file}: ${line.trim()}`);
      count += 1;
    }
  }
  assert.ok(count >= 5, 'the jobs were read');
  const ci = workflows.find(([file]) => file === 'ci.yml')[1].join('\n');
  const job = ci.slice(ci.indexOf('\n  android-artifact:\n') + 1).split(/\n {2}[a-z-]+:\n/)[0];
  assert.match(job, /\n {4}runs-on: \$\{\{ fromJSON\(vars\.ANDROID_ARTIFACT_RUNNER \|\| '"ubuntu-latest"'\) \}\}\n/);
});
