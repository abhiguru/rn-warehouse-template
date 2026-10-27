import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const directory = new URL('../.github/workflows/', import.meta.url);
const workflows = readdirSync(directory).map(file => [file, readFileSync(new URL(file, directory), 'utf8').split('\n')]);
const dependabot = readFileSync(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const workflowText = file => workflows.find(([name]) => name === file)[1].join('\n');

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
  assert.ok(names.length >= 32, 'ignore entries were read');
  for (const index of names) {
    assert.match(lines[index + 1], /^\s+update-types: \["version-update:semver-(?:major|minor|patch)"(?:, "version-update:semver-(?:major|minor|patch)")*\]$/, lines[index].trim());
  }
  assert.doesNotMatch(dependabot, /^\s+versions:/m);
});

// A self-hosted label written into a workflow would leave that job waiting for
// ever in every fork. CI jobs take their runner from a repository variable, fall
// back to a hosted runner, and always use a hosted runner for a pull request from
// a fork, so a fork's code never runs on the project's own machine.
test('no workflow names a self-hosted runner; CI jobs take their runner from a repository variable, never for a fork', () => {
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
  assert.match(job, /\n {4}runs-on: \$\{\{ github\.event\.pull_request\.head\.repo\.fork && 'ubuntu-latest' \|\| fromJSON\(vars\.ANDROID_ARTIFACT_RUNNER \|\| '"ubuntu-latest"'\) \}\}\n/);
  const ciRunsOn = ci.split('\n').filter(line => /^ {4}runs-on:/.test(line));
  assert.ok(ciRunsOn.length >= 4, 'the CI jobs were read');
  for (const line of ciRunsOn) {
    assert.match(line, /^ {4}runs-on: \$\{\{ github\.event\.pull_request\.head\.repo\.fork && 'ubuntu-latest' \|\| fromJSON\(vars\.(?:CI_RUNNER|ANDROID_ARTIFACT_RUNNER) \|\| '"ubuntu-latest"'\) \}\}$/, line.trim());
  }
});

// Review 2026-10-17, M03: the test files are excluded from `tsc --noEmit`, so a
// type error in a test went unseen until `typecheck:tests` was run by hand.
test('CI and the release both type-check the test files', () => {
  for (const file of ['ci.yml', 'release.yml']) {
    assert.match(workflowText(file), /^\s*(?:- )?run: npm run typecheck:tests$/m, file);
  }
  assert.equal(manifest.scripts['typecheck:tests'], 'tsc -p tsconfig.test.json');
});

// Review 2026-10-17, M04: `npx <name>` fetches a package that is not installed
// from the registry at run time, so each run could execute a different tool.
test('every npx in a workflow runs a locked package: --no-install, or a name package.json lists', () => {
  const declared = new Set([...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)]);
  let count = 0;
  for (const [file, lines] of workflows) {
    for (const line of lines) {
      const match = /\bnpx\s+(.*?)\s*(?:#.*)?$/.exec(line);
      if (!match) continue;
      const words = match[1].split(/\s+/);
      const flags = words.filter((word, index) => word.startsWith('-') && words.slice(0, index).every(before => before.startsWith('-')));
      const name = words.find(word => !word.startsWith('-'));
      assert.ok(!flags.includes('--yes') && !flags.includes('-y'), `${file}: ${line.trim()} installs without asking`);
      assert.ok(flags.includes('--no-install') || declared.has(name), `${file}: npx ${name} is neither --no-install nor listed in package.json`);
      count += 1;
    }
  }
  assert.ok(count >= 6, 'the npx steps were read');
});

test('expo-doctor is locked at one exact version, and CI and the release run it with --no-install', () => {
  const version = manifest.devDependencies['expo-doctor'];
  assert.match(version, /^\d+\.\d+\.\d+$/, 'expo-doctor is pinned exactly in devDependencies');
  assert.equal(lockfile.packages['node_modules/expo-doctor'].version, version);
  assert.equal(lockfile.packages[''].devDependencies['expo-doctor'], version);
  for (const file of ['ci.yml', 'release.yml']) {
    assert.match(workflowText(file), /^\s*(?:- )?run: npx --no-install expo-doctor$/m, file);
  }
});

// Review 2026-10-17, M10: a bundle that is only exported, never audited, is not checked.
test('CI and the release audit the exported bundle directory after the export', () => {
  for (const file of ['ci.yml', 'release.yml']) {
    const text = workflowText(file);
    const exported = text.search(/npx expo export --platform android/);
    const audited = text.search(/^\s*(?:- )?run: npm run audit:artifact -- dist$/m);
    assert.ok(exported >= 0 && audited > exported, `${file}: audit:artifact -- dist after expo export`);
  }
});

// Review 2026-10-17, M13: warnings never failed CI, and the release hid them with --quiet.
test('CI and the release run the same lint command with the same warning limit, and neither hides warnings', () => {
  const limits = ['ci.yml', 'release.yml'].map(file => {
    const text = workflowText(file);
    assert.doesNotMatch(text, /--quiet/, `${file}: --quiet hides warnings`);
    const match = /^\s*(?:- )?run: npm run lint -- --max-warnings (\d+)$/m.exec(text);
    assert.ok(match, `${file}: npm run lint -- --max-warnings N`);
    return Number(match[1]);
  });
  assert.equal(limits[0], limits[1], 'ci.yml and release.yml name one limit');
});
