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
  // Two independent counts must agree, so an entry the line pattern misses is caught
  // and adding or removing an entry needs no hand-kept number.
  const raw = dependabot.split('dependency-name:').length - 1;
  assert.ok(raw > 0, 'ignore entries were read');
  assert.equal(names.length, raw, 'every dependency-name line was recognised');
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

// The monthly SDK watch runs on the same runner variable as the CI jobs, and never names a self-hosted label.
test('sdk-watch.yml takes its runner from CI_RUNNER and is not triggered by pull requests', () => {
  const text = workflowText('sdk-watch.yml');
  const runsOn = text.split('\n').filter(line => /^\s*runs-on:/.test(line));
  assert.equal(runsOn.length, 1, 'one job');
  assert.match(runsOn[0], /^ {4}runs-on: \$\{\{ fromJSON\(vars\.CI_RUNNER \|\| '"ubuntu-latest"'\) \}\}$/);
  assert.doesNotMatch(runsOn[0], /self-hosted/);
  assert.doesNotMatch(text, /^\s*pull_request/m, 'no fork clause is needed because no pull request starts it');
  assert.match(text, /^ {2}schedule:\n/m);
});

// The release validation runs on the same runner variable as the CI jobs. Only a version tag starts it, and a tag
// is pushed by a maintainer (a fork's tag runs in the fork, with the fork's own variables), so it has no fork clause.
//
// WH-134, owner 2026-11-13: ONLY the `sign` and `no-apk-notice` jobs run on GitHub's hosted runner (ubuntu-latest), so
// the signing key never reaches the CI_RUNNER machine; every other job takes its runner from CI_RUNNER.
const releaseJobs = () => {
  const text = workflowText('release.yml');
  const body = text.slice(text.indexOf('\njobs:\n') + '\njobs:\n'.length);
  const jobs = new Map();
  let name = null;
  for (const line of body.split('\n')) {
    const header = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (header) {
      name = header[1];
      jobs.set(name, []);
    } else if (name) jobs.get(name).push(line);
  }
  return jobs;
};
const HOSTED_JOBS = ['sign', 'no-apk-notice'];

test('release.yml runs only sign and no-apk-notice on the hosted runner; every other job takes its runner from CI_RUNNER', () => {
  const text = workflowText('release.yml');
  const jobs = releaseJobs();
  assert.deepEqual([...jobs.keys()], ['release', 'sign', 'no-apk-notice'], 'the jobs');
  for (const [name, lines] of jobs) {
    const runsOn = lines.filter(line => /^ {4}runs-on:/.test(line));
    assert.equal(runsOn.length, 1, `${name}: one runs-on`);
    assert.doesNotMatch(runsOn[0], /self-hosted/, name);
    if (HOSTED_JOBS.includes(name)) assert.equal(runsOn[0], '    runs-on: ubuntu-latest', `${name} runs on the hosted runner`);
    else assert.match(runsOn[0], /^ {4}runs-on: \$\{\{ fromJSON\(vars\.CI_RUNNER \|\| '"ubuntu-latest"'\) \}\}$/, `${name} runs on CI_RUNNER`);
  }
  assert.equal(text.split('\n').filter(line => /^\s*runs-on:/.test(line)).length, 3, 'no job outside the three');
  assert.match(text, /^on:\n {2}push:\n {4}tags:\n {6}- 'v\*'\n\n/m, 'a version tag is the only trigger');
  assert.doesNotMatch(text, /^\s*(?:pull_request|workflow_dispatch|schedule)/m, 'no other trigger');
});

test('release.yml: sign has no checkout and holds the keystore secrets only in the neutral-apk-release environment', () => {
  const jobs = releaseJobs();
  const sign = jobs.get('sign').join('\n');
  assert.doesNotMatch(sign, /actions\/checkout/, 'sign runs no repository code');
  assert.match(sign, /^ {4}environment: neutral-apk-release$/m, 'sign waits in the protected environment');
  const secrets = ['NEUTRAL_APK_KEYSTORE_BASE64', 'NEUTRAL_APK_KEYSTORE_PASSWORD', 'NEUTRAL_APK_KEY_PASSWORD', 'NEUTRAL_APK_KEY_ALIAS'];
  for (const secret of secrets) assert.match(sign, new RegExp(`secrets\\.${secret}\\b`), `sign reads ${secret}`);
  for (const [name, lines] of jobs) {
    if (name === 'sign') continue;
    const other = lines.join('\n');
    assert.doesNotMatch(other, /secrets\.NEUTRAL_APK|NEUTRAL_APK_KEY/, `${name} cannot read the signing key`);
    assert.doesNotMatch(other, /^ {4}environment:/m, `${name} is not in an environment`);
  }
  assert.doesNotMatch(workflowText('release.yml'), /secrets\.(?!NEUTRAL_APK_)/, 'no other secret is read');
  assert.doesNotMatch(workflowText('ci.yml'), /NEUTRAL_APK/, 'ci.yml never reads the signing key');
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

// The Gradle download is checked on every runner; the mirror rewrite is for self-hosted runners only.
test('the Android build pins Gradle checksums and limits the mirror to self-hosted runners', () => {
  const ci = workflowText('ci.yml');
  const step = ci.slice(ci.indexOf('- name: Assemble debug APK'), ci.indexOf('- name: Audit picker React Native ABI'));
  assert.match(step, /distributionSha256Sum=\$dist_sha/);
  assert.match(step, /cp \.\.\/node_modules\/@react-native\/gradle-plugin\/gradle\/wrapper\/gradle-wrapper\.jar gradle\/wrapper\/gradle-wrapper\.jar/);
  assert.match(step, /actual_jar_sha/);
  assert.match(step, /has no pinned checksums/);
  const guard = step.indexOf('if [ "$RUNNER_ENVIRONMENT" = "self-hosted" ]');
  assert.ok(guard > 0, 'self-hosted guard');
  assert.ok(step.indexOf('gradle-distributions') > guard, 'mirror rewrite is inside the guard');
  assert.ok(step.indexOf('preferIPv4Stack') > guard, 'IPv4 option is inside the guard');
  assert.ok(step.indexOf('distributionSha256Sum=$dist_sha') < guard, 'the pin is outside the guard');
});

// WH-134, WH-140, WH-144, WH-149: what the release workflow must do for the neutral APK and the text checks.
test('release.yml marks the build neutral with EXPO_PUBLIC_UPDATE_URL = the latest-release page, in prebuild and in assemble, and sets no central login', () => {
  const text = workflowText('release.yml');
  const urls = text.split('\n').filter(line => /EXPO_PUBLIC_UPDATE_URL:/.test(line));
  assert.equal(urls.length, 2, 'the prebuild step and the assemble step');
  for (const line of urls) assert.equal(line.trim(), 'EXPO_PUBLIC_UPDATE_URL: https://github.com/${{ github.repository }}/releases/latest');
  assert.doesNotMatch(text, /EXPO_PUBLIC_CENTRAL_ORIGIN:/, 'central sign-in stays off in the neutral build');
  assert.doesNotMatch(text, /WAREHOUSE_BRAND_PACK|EXPO_PUBLIC_DEFAULT_BRAND|EXPO_PUBLIC_LEGAL_TEXT/, 'the neutral build uses no brand pack and the template legal pages');
  assert.equal([...text.matchAll(/WAREHOUSE_APP_NAME: Cold Storage$/gm)].length, 2, 'the neutral name');
});

test('release.yml: the APK is signed and published only by sign, only when the legal text is reviewed, after the release job passed', () => {
  const jobs = releaseJobs();
  const sign = jobs.get('sign').join('\n');
  assert.match(sign, /^ {4}needs: release$/m);
  assert.match(sign, /^ {4}if: \$\{\{ needs\.release\.outputs\.legal_reviewed == 'true' \}\}$/m);
  assert.match(sign, /^ {4}permissions:\n {6}contents: write$/m);
  const release = jobs.get('release').join('\n');
  assert.doesNotMatch(release, /gh release|apksigner|contents: write/, 'the CI_RUNNER job neither signs nor publishes');
  assert.match(release, /legal_reviewed: \$\{\{ steps\.legal\.outputs\.reviewed \}\}/);
  const notice = jobs.get('no-apk-notice').join('\n');
  assert.match(notice, /^ {4}needs: \[release, sign\]$/m);
  assert.match(notice, /needs\.release\.result == 'success' && needs\.sign\.result != 'success'/, 'only when the build passed and signing did not');
});

test('release.yml runs the Gujarati release check, and not the public check (a tag is not blocked by the review)', () => {
  const text = workflowText('release.yml');
  assert.match(text, /^\s*- run: npm run i18n:release-check$/m);
  assert.doesNotMatch(text, /i18n:public-check|i18n-release-check\.mjs --public/);
  assert.equal(manifest.scripts['i18n:release-check'], 'node scripts/i18n-release-check.mjs');
  assert.equal(manifest.scripts['i18n:public-check'], 'node scripts/i18n-release-check.mjs --public');
  assert.equal(manifest.scripts['i18n:review-sheet'], 'node scripts/i18n-review-sheet.mjs');
  assert.equal(manifest.scripts['i18n:review-apply'], 'node scripts/i18n-review-apply.mjs');
});

// WH-134, Opus review of the batch: pre-release tags, the self-hosted Gradle settings and a re-run of the notice.
const runBlock = (lines, afterMarker) => {
  const start = lines.findIndex(line => line.includes(afterMarker));
  assert.ok(start >= 0, `${afterMarker} was found`);
  const first = lines.findIndex((line, i) => i >= start && /^\s*run: \|$/.test(line));
  const indent = lines[first].match(/^\s*/)[0].length + 2;
  const body = [];
  for (const line of lines.slice(first + 1)) {
    if (line.trim() && line.match(/^\s*/)[0].length < indent) break;
    body.push(line.slice(indent));
  }
  return body.join('\n');
};
const selfHostedBlock = text => {
  const match = /^( *)if \[ "\$RUNNER_ENVIRONMENT" = "self-hosted" \]; then\n[\s\S]*?\n\1fi$/m.exec(text);
  assert.ok(match, 'the self-hosted Gradle block');
  return match[0].split('\n').map(line => line.replace(new RegExp(`^${match[1]}`), '')).join('\n');
};

test('release.yml carries ci.yml\'s self-hosted Gradle settings in its assemble step, unchanged', () => {
  const ci = selfHostedBlock(workflowText('ci.yml'));
  const release = selfHostedBlock(workflowText('release.yml'));
  assert.equal(release, ci);
  assert.match(release, /-Djava\.net\.preferIPv4Stack=true/);
  assert.match(release, /networkTimeout=60000/);
  assert.match(release, /gradle\/gradle-distributions\/releases\/download/);
  const assemble = runBlock(releaseJobs().get('release'), 'Assemble the release APK');
  assert.ok(assemble.indexOf('self-hosted') < assemble.indexOf('./gradlew assembleRelease'), 'set before Gradle runs');
});

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync as readFile, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Runs a job's script with a fake `gh` that logs its arguments; the release exists (or not) and has the given body. */
function runWithFakeGh(script, env, { exists, body = '' }) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-gh-'));
  try {
    mkdirSync(join(dir, 'bin'));
    const log = join(dir, 'calls.log');
    writeFileSync(join(dir, 'bin/gh'), `#!/usr/bin/env bash
echo "$*" >> "${log}"
if [ "$1 $2" = "release view" ]; then
  case "$*" in *"--json body"*) printf '%s' "$FAKE_BODY" ;; esac
  [ "$FAKE_EXISTS" = "yes" ]
  exit $?
fi
cat > /dev/null 2>&1 || true
exit 0
`);
    chmodSync(join(dir, 'bin/gh'), 0o755);
    writeFileSync(join(dir, 'step.sh'), script);
    mkdirSync(join(dir, 'tmp'));
    const result = spawnSync('bash', ['-e', join(dir, 'step.sh')], {
      cwd: dir,
      encoding: 'utf8',
      env: { PATH: `${join(dir, 'bin')}:${process.env.PATH}`, RUNNER_TEMP: join(dir, 'tmp'), FAKE_EXISTS: exists ? 'yes' : 'no', FAKE_BODY: body, ...env },
    });
    let calls = '';
    try { calls = readFile(log, 'utf8'); } catch { /* no call */ }
    return { ...result, calls: calls.split('\n').filter(Boolean) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const NOTE_TEXT = 'No Android APK was published for this release: the signing step was rejected or failed. See the Release workflow run.';
const createCalls = calls => calls.filter(call => call.startsWith('release create'));

test('no-apk-notice: a pre-release tag is created with --prerelease --latest=false, a plain tag is not', () => {
  const script = runBlock(releaseJobs().get('no-apk-notice'), 'steps:');
  for (const [tag, pre] of [['v1.0.0-rc.1', true], ['v0.2.2-demo', true], ['v1.2.3', false], ['v10.0.0', false]]) {
    const result = runWithFakeGh(script, { RELEASE_TAG: tag, NOTE: NOTE_TEXT }, { exists: false });
    assert.equal(result.status, 0, result.stderr);
    const [create] = createCalls(result.calls);
    assert.ok(create, `${tag} was created`);
    assert.equal(create.includes('--prerelease --latest=false'), pre, `${tag}: ${create}`);
    assert.ok(create.includes(`release create ${tag} `), create);
  }
});

test('no-apk-notice: a re-run does not add the note a second time, a first run does', () => {
  const script = runBlock(releaseJobs().get('no-apk-notice'), 'steps:');
  const env = { RELEASE_TAG: 'v1.2.3', NOTE: NOTE_TEXT };
  const first = runWithFakeGh(script, env, { exists: true, body: 'Release text.' });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.calls.filter(call => call.startsWith('release edit')).length, 1, 'the note is added once');
  const again = runWithFakeGh(script, env, { exists: true, body: `Release text.\n\n${NOTE_TEXT}\n` });
  assert.equal(again.status, 0, again.stderr);
  assert.equal(again.calls.filter(call => call.startsWith('release edit')).length, 0, 'the note is already there');
  assert.equal(createCalls(again.calls).length, 0);
});

test('sign: its release create call takes the same pre-release flags, and the tag reaches the script only through an env var', () => {
  const lines = releaseJobs().get('sign');
  const script = runBlock(lines, 'Sign, verify and publish');
  assert.match(script, /case "\$RELEASE_TAG" in \*-\*\) kind=\(--prerelease --latest=false\) ;; esac/);
  const create = script.split('\n').find(line => line.includes('gh release create'));
  assert.ok(create.includes('${kind[@]+"${kind[@]}"}'), create);
  for (const [name, job] of releaseJobs()) {
    for (const [index, line] of runBlock(job, name === 'sign' ? 'Sign, verify and publish' : name === 'no-apk-notice' ? 'steps:' : 'Assemble the release APK').split('\n').entries()) {
      assert.doesNotMatch(line, /\$\{\{/, `${name} script line ${index + 1} interpolates an expression`);
    }
  }
});

// WH-194 (owner 2026-11-13, "Warn on PRs"): Expo patch releases made `expo install --check` fail unrelated pull
// requests. On pull_request and push the findings are a warning and the job goes on; the weekly schedule and a
// manual run fail.
const expoCheckStep = () => {
  const lines = workflowText('ci.yml').split('\n');
  const start = lines.findIndex(line => line === '      - name: Expo SDK dependency compatibility');
  assert.ok(start >= 0, 'the Expo check step exists');
  let end = start + 1;
  while (end < lines.length && !/^ {6}(?:- |#)/.test(lines[end])) end += 1;
  const step = lines.slice(start, end);
  const runAt = step.findIndex(line => line === '        run: |');
  assert.ok(runAt >= 0, 'the step has a multi-line run');
  const body = [];
  for (const line of step.slice(runAt + 1)) {
    if (/^ {8}\S/.test(line)) break;
    body.push(line.replace(/^ {10}/, ''));
  }
  return { text: step.join('\n'), script: body.join('\n') };
};

test('WH-194: ci.yml has one weekly schedule at an off-peak minute and a manual trigger; only the ci job runs on a schedule', () => {
  const text = workflowText('ci.yml');
  const crons = [...text.matchAll(/^\s+- cron: '([^']+)'$/gm)].map(match => match[1]);
  assert.equal(crons.length, 1, 'one cron');
  const [minute, hour, dayOfMonth, month, dayOfWeek] = crons[0].split(' ');
  assert.match(minute, /^\d+$/);
  assert.ok(!['0', '30'].includes(minute), 'not on the hour or half hour');
  assert.match(hour, /^\d+$/);
  assert.equal(dayOfMonth + month, '**', 'weekly, not monthly');
  assert.match(dayOfWeek, /^\d$/, 'one day of the week');
  assert.match(text, /^ {2}workflow_dispatch:$/m);
  for (const job of ['android-artifact', 'dependencies', 'secrets']) {
    const header = text.indexOf(`\n  ${job}:\n`);
    assert.ok(header >= 0, job);
    const block = text.slice(header + 1).split(/\n {2}[a-z-]+:\n/)[0];
    assert.match(block, /\n {4}if: github\.event_name != 'schedule'\n/, `${job} does not start on a schedule`);
  }
  const ciJob = text.slice(text.indexOf('\n  ci:\n') + 1).split(/\n {2}[a-z-]+:\n/)[0];
  assert.doesNotMatch(ciJob, /\n {4}if:/, 'the ci job runs on a schedule');
});

test('WH-194: the Expo check step reads the event name from env, is not a bare continue-on-error, and runs before Jest', () => {
  const { text, script } = expoCheckStep();
  assert.match(text, /\n {10}EVENT_NAME: \$\{\{ github\.event_name \}\}\n/);
  assert.doesNotMatch(script, /\$\{\{/, 'no expression inside the script body');
  assert.doesNotMatch(text, /continue-on-error/);
  assert.match(script, /::warning /);
  assert.match(script, /GITHUB_STEP_SUMMARY/);
  assert.match(script, /^ {2}pull_request\|push\)$/m, 'only pull_request and push warn');
  const ci = workflowText('ci.yml');
  assert.ok(ci.indexOf('Expo SDK dependency compatibility') < ci.indexOf('run: npm test\n'), 'before Jest');
});

const EXPO_FINDINGS = [
  'The following packages should be updated for best compatibility with the installed expo version:',
  '  expo-font@14.0.12 - expected version: ~14.0.13',
].join('\n');

const runExpoCheck = (eventName, npxExit, output = EXPO_FINDINGS) => {
  const dir = mkdtempSync(join(tmpdir(), 'wh194-'));
  try {
    mkdirSync(join(dir, 'bin'));
    const fake = join(dir, 'bin', 'npx');
    writeFileSync(fake, npxExit === 0 ? '#!/bin/sh\necho "Dependencies are up to date"\nexit 0\n' : `#!/bin/sh\ncat <<'TEXT'\n${output}\nTEXT\nexit ${npxExit}\n`);
    chmodSync(fake, 0o755);
    const summary = join(dir, 'summary.md');
    writeFileSync(summary, '');
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', expoCheckStep().script], {
      encoding: 'utf8',
      env: { PATH: `${join(dir, 'bin')}:${process.env.PATH}`, EVENT_NAME: eventName, GITHUB_STEP_SUMMARY: summary },
    });
    return { ...result, summary: readFileSync(summary, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

for (const eventName of ['pull_request', 'push']) {
  test(`WH-194: on ${eventName} outdated Expo packages are a warning with the list, in the summary too, and the step passes`, () => {
    const result = runExpoCheck(eventName, 1);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^::warning title=Expo SDK dependencies are outdated::.*should be updated.*%0A.*expo-font@14\.0\.12/m);
    assert.doesNotMatch(result.stdout, /^::error/m);
    assert.match(result.stdout, /expected version: ~14\.0\.13/, 'the findings are still printed');
    assert.match(result.summary, /should be updated/);
    assert.match(result.summary, /expo-font@14\.0\.12/);
  });
}

for (const eventName of ['schedule', 'workflow_dispatch']) {
  test(`WH-194: on ${eventName} outdated Expo packages fail the step with the exit status of the check`, () => {
    const result = runExpoCheck(eventName, 3);
    assert.equal(result.status, 3);
    assert.match(result.stdout, /should be updated/);
    assert.match(result.stdout, /^::error title=Expo SDK dependencies are outdated::/m);
    assert.doesNotMatch(result.stdout, /^::warning/m);
  });
}

test('WH-194: when the Expo versions match, the step passes on every event and warns about nothing', () => {
  for (const eventName of ['pull_request', 'push', 'schedule', 'workflow_dispatch']) {
    const result = runExpoCheck(eventName, 0);
    assert.equal(result.status, 0, eventName);
    assert.doesNotMatch(result.stdout, /^::(warning|error)/m, eventName);
    assert.equal(result.summary, '', eventName);
  }
});

// A broken check is not "outdated packages": it fails on every event, with its own message.
for (const eventName of ['pull_request', 'push', 'schedule', 'workflow_dispatch']) {
  for (const [label, code, output] of [
    ['a network-style failure', 1, 'FetchError: request to https://registry.npmjs.org/ failed, reason: getaddrinfo EAI_AGAIN'],
    ['a missing binary', 127, 'npx: command not found'],
  ]) {
    test(`WH-194: on ${eventName}, ${label} (exit ${code}) fails the step as a broken check, not as outdated packages`, () => {
      const result = runExpoCheck(eventName, code, output);
      assert.equal(result.status, code, result.stderr);
      assert.match(result.stdout, /^::error title=Expo SDK check failed::/m);
      assert.doesNotMatch(result.stdout, /^::warning/m);
      assert.doesNotMatch(result.stdout, /dependencies are outdated/);
      assert.equal(result.summary, '');
    });
  }
}
