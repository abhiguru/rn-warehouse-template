import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { generateKeyPairSync, sign, constants } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, cpSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { backportSource, securityBackports } from './patch-security-backports.mjs';

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('./security-backports.json', import.meta.url)));
const forge = require('node-forge');
const braces = require('braces');
const pair = generateKeyPairSync('rsa', { modulusLength: 1024 });
const privateKey = forge.pki.privateKeyFromPem(pair.privateKey.export({ type: 'pkcs1', format: 'pem' }));
const publicKey = forge.pki.publicKeyFromPem(pair.publicKey.export({ type: 'pkcs1', format: 'pem' }));
const message = 'fictional local dependency regression';
const digest = forge.md.sha256.create().update(message).digest().getBytes();
const asn1 = forge.asn1;
const node = (type, constructed, value) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
const oid = () => node(asn1.Type.OID, false, asn1.oidToDer(forge.pki.oids.sha256).getBytes());
const nullNode = () => node(asn1.Type.NULL, false, '');
function signature(children) {
  const info = node(asn1.Type.SEQUENCE, true, [
    node(asn1.Type.SEQUENCE, true, children), node(asn1.Type.OCTETSTRING, false, digest),
  ]);
  return privateKey.sign(asn1.toDer(info).getBytes(), 'NONE');
}

test('RSA rejects extra nested DigestAlgorithm children with and without NULL', () => {
  for (const children of [
    [oid(), nullNode(), node(asn1.Type.OCTETSTRING, false, 'fictional extra element')],
    [oid(), node(asn1.Type.OCTETSTRING, false, 'fictional extra element')],
    [oid(), nullNode(), nullNode()],
  ]) assert.throws(() => publicKey.verify(digest, signature(children)), /DigestInfo/);
});

test('RSA still verifies valid SHA256 AlgorithmIdentifier with optional NULL', () => {
  for (const children of [[oid()], [oid(), nullNode()]]) {
    assert.equal(publicKey.verify(digest, signature(children)), true);
  }
  assert.equal(publicKey.verify('wrong digest', signature([oid(), nullNode()])), false);
});

test('RSA verification interoperates with native PKCS1 and PSS signatures', () => {
  const regular = sign('sha256', Buffer.from(message), pair.privateKey);
  assert.equal(publicKey.verify(digest, regular.toString('binary')), true);
  const pssSignature = sign('sha256', Buffer.from(message), {
    key: pair.privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
  });
  const scheme = forge.pss.create({ md: forge.md.sha256.create(), mgf: forge.mgf.mgf1.create(forge.md.sha256.create()), saltLength: 32 });
  assert.equal(publicKey.verify(digest, pssSignature.toString('binary'), scheme), true);
});

test('braces rejects deeply nested braces and parentheses before stack exhaustion', () => {
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    const input = open.repeat(4000) + 'a,b' + close.repeat(4000);
    for (const operation of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => operation(input), error => error instanceof SyntaxError && /maximum nesting depth/.test(error.message));
    }
  }
});

test('braces direct AST walkers refuse excessive depth and cycles', () => {
  const root = { type: 'root', nodes: [] };
  let tail = root;
  for (let i = 0; i < 500; i++) {
    const child = { type: 'brace', nodes: [], parent: tail, commas: 0, ranges: 0 };
    tail.nodes.push(child); tail = child;
  }
  tail.nodes.push({ type: 'text', value: 'a' });
  for (const operation of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => operation(root), /maximum nesting depth/);
  }
  const cycle = { type: 'root', nodes: [] }; cycle.nodes.push(cycle);
  for (const operation of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => operation(cycle), /maximum nesting depth/);
  }
});

test('braces and micromatch retain normal nested, range, escaped and quoted patterns', () => {
  assert.deepEqual(braces.expand('src/{a,{b,c}}/{01..03}'), ['src/a/01', 'src/a/02', 'src/a/03', 'src/b/01', 'src/b/02', 'src/b/03', 'src/c/01', 'src/c/02', 'src/c/03']);
  assert.equal(braces.compile('src/{a,{b,c}}'), 'src/(a|(b|c))');
  assert.deepEqual(braces.expand('\\{literal\\}'), ['{literal}']);
  assert.deepEqual(braces.expand('"' + '{'.repeat(500) + '"'), ['{'.repeat(500)]);
  assert.deepEqual(require('micromatch')(['src/a.ts', 'src/b.tsx', 'src/c.js'], ['src/*.{ts,tsx}']), ['src/a.ts', 'src/b.tsx']);
});

// The copy of a package at the version the manifest names, wherever the lockfile puts it
// (zod 3.25.76 is nested under expo; the top level holds zod 4).
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
function installedDirectory(spec) {
  const paths = Object.keys(lock.packages).filter(path => (path === `node_modules/${spec.package}` || path.endsWith(`/node_modules/${spec.package}`)) && lock.packages[path].version === spec.version);
  assert.equal(paths.length, 1, `exactly one installed ${spec.package}@${spec.version}`);
  return resolve(paths[0]);
}

function originalSource(spec) {
  let source = readFileSync(resolve(installedDirectory(spec), spec.file), 'utf8');
  for (const edit of [...spec.edits].reverse()) source = source.replaceAll(edit.after, edit.before);
  return source;
}

test('backports refuse changed input/version and are exactly idempotent', () => {
  for (const spec of manifest.files) {
    const source = originalSource(spec);
    const patched = backportSource(source, spec.version, spec);
    assert.equal(backportSource(patched, spec.version, spec), patched);
    assert.throws(() => backportSource(source + '\n', spec.version, spec), /Unreviewed/);
    assert.throws(() => backportSource(source, '0.0.0', spec), /Unreviewed/);
  }
});

test('installer verifies all targets before writes and refuses symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'warehouse-security-backport-'));
  try {
    const packages = {};
    for (const spec of manifest.files) {
      const directory = join(root, 'node_modules', spec.package);
      mkdirSync(dirname(join(directory, spec.file)), { recursive: true });
      writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: spec.package, version: spec.version }));
      writeFileSync(join(directory, spec.file), originalSource(spec));
      packages[`node_modules/${spec.package}`] = { version: spec.version };
    }
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ packages }));
    const first = manifest.files[0];
    const firstPath = join(root, 'node_modules', first.package, first.file);
    const before = readFileSync(firstPath, 'utf8');
    assert.throws(() => securityBackports(root, { verifyOnly: true }), /absent/);
    assert.equal(readFileSync(firstPath, 'utf8'), before);
    const last = manifest.files.at(-1);
    const lastPath = join(root, 'node_modules', last.package, last.file);
    const original = readFileSync(lastPath, 'utf8');
    writeFileSync(lastPath, original + '\n');
    assert.throws(() => securityBackports(root), /Unreviewed/);
    assert.equal(readFileSync(firstPath, 'utf8'), before);
    writeFileSync(lastPath, original);
    assert.equal(securityBackports(root).length, manifest.files.length);
    assert.equal(securityBackports(root, { verifyOnly: true }).length, manifest.files.length);
    rmSync(lastPath); symlinkSync(firstPath, lastPath);
    assert.throws(() => securityBackports(root), /Symlink/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('sprintf precision bounds preserve valid formatting and prevent native RangeError', () => {
  const { sprintf } = require('sprintf-js');
  for (const [format, value, output] of [
    ['%.2f', 1.25, '1.25'], ['%.0f', 1.6, '2'], ['%.0e', 1.6, '2e+0'],
    ['%.3g', 12.34, '12.3'], ['%+.2f', 1.25, '+1.25'], ['%.2s', 'hello', 'he'],
    ['%s:%d', 'record', 'record:7'],
  ]) assert.equal(sprintf(format, value, 7), output);
  for (const type of ['f', 'e', 'g']) {
    const bound = sprintf(`%.100${type}`, 1.25);
    for (const digits of ['101', '99999999', '9'.repeat(400)]) {
      assert.equal(sprintf(`%.${digits}${type}`, 1.25), bound);
    }
  }
  assert.equal(sprintf('%.0g', 1.25), '1');
  assert.equal(sprintf('%.2f', NaN), '-NaN');
  assert.equal(sprintf('%.101f', NaN), '-NaN');
  assert.equal(sprintf('%.101f', Infinity), 'Infinity');
});

test('precision payload no longer terminates an asynchronous worker under the default policy', () => {
  const spec = manifest.files.find(file => file.package === 'sprintf-js');
  const root = mkdtempSync(join(tmpdir(), 'warehouse-sprintf-regression-'));
  try {
    const original = join(root, 'original.cjs');
    writeFileSync(original, originalSource(spec));
    const current = resolve('node_modules/sprintf-js/src/sprintf.js');
    for (const [file, shouldPass] of [[original, false], [current, true]]) {
      const code = `const {sprintf}=require(${JSON.stringify(file)}); setImmediate(()=>{for(const kind of ['f','e','g']) sprintf('%.101'+kind,1); sprintf('%.0g',1); console.log('worker survived');});`;
      const child = spawnSync(process.execPath, ['-e', code], { timeout: 2000, encoding: 'utf8', maxBuffer: 8192 });
      assert.equal(child.error, undefined);
      if (shouldPass) { assert.equal(child.status, 0); assert.match(child.stdout, /worker survived/); }
      else { assert.notEqual(child.status, 0); assert.match(child.stderr, /RangeError/); }
    }
  } finally { rmSync(root, {recursive: true, force: true}); }
});

// ---- zod 3.25.76 under expo (the copy @expo/cli loads), GHSA-mrhx-c7xc-m3w5 ----
const zodFiles = manifest.files.filter(file => file.package === 'zod');
const nestedZod = installedDirectory(zodFiles[0]);
const cliRequire = createRequire(join(resolve('node_modules/expo/node_modules/@expo/cli'), 'package.json'));

test('zod entries cover both loadable v3 files of the nested copy and cite the advisory and the v4 fix', () => {
  assert.deepEqual(zodFiles.map(file => file.file).sort(), ['v3/types.cjs', 'v3/types.js']);
  assert.ok(zodFiles.every(file => file.version === '3.25.76'));
  assert.equal(nestedZod, resolve('node_modules/expo/node_modules/zod'));
  assert.equal(manifest.references.zod.advisory, 'GHSA-mrhx-c7xc-m3w5');
  assert.equal(manifest.references.zod.commit, 'a0ebf970f2d752e5f58527cd2942ff48be4f46bd');
  assert.match(manifest.references.zod.implementation, /v3 has no upstream fix/);
  // Everything the package can load for the root or zod/v3 comes from these two files.
  const external = readFileSync(join(nestedZod, 'v3/external.cjs'), 'utf8') + readFileSync(join(nestedZod, 'v3/external.js'), 'utf8');
  assert.match(external, /types\.cjs/);
  assert.match(external, /types\.js/);
});

test('@expo/cli resolves the patched nested zod, and the top-level zod 4 is left as published', () => {
  assert.equal(cliRequire.resolve('zod'), join(nestedZod, 'index.cjs'));
  assert.equal(createRequire(import.meta.url)('zod/package.json').version.split('.')[0], '4');
  for (const spec of zodFiles) {
    const source = readFileSync(join(nestedZod, spec.file), 'utf8');
    assert.match(source, /GHSA-mrhx-c7xc-m3w5/);
    assert.equal(backportSource(source, spec.version, spec), source);
  }
  assert.doesNotMatch(readFileSync(resolve('node_modules/zod/v3/types.cjs'), 'utf8'), /GHSA-mrhx-c7xc-m3w5/);
});

test('installer patches only the zod copy below 4.6.6 and refuses an unreviewed one', () => {
  const root = mkdtempSync(join(tmpdir(), 'warehouse-zod-backport-'));
  const nested = 'node_modules/expo/node_modules/zod';
  const packages = {};
  const place = (path, name, version, files) => {
    packages[path] = { version };
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, 'package.json'), JSON.stringify({ name, version }));
    for (const [file, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path, file)), { recursive: true }); writeFileSync(join(root, path, file), text); }
  };
  const lay = version => {
    for (const spec of manifest.files) {
      const path = spec.package === 'zod' ? nested : `node_modules/${spec.package}`;
      place(path, spec.package, spec.package === 'zod' ? version : spec.version, { [spec.file]: originalSource(spec) });
    }
    place('node_modules/zod', 'zod', '4.6.7', { 'v3/types.cjs': 'top level, unchanged', 'v3/types.js': 'top level, unchanged' });
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ packages }));
  };
  try {
    lay('3.25.76');
    const done = securityBackports(root).filter(change => change.package === 'zod');
    assert.deepEqual(done.map(change => change.installedPath), [nested, nested]);
    assert.equal(readFileSync(join(root, 'node_modules/zod/v3/types.cjs'), 'utf8'), 'top level, unchanged');
    assert.equal(securityBackports(root, { verifyOnly: true }).filter(change => change.package === 'zod').length, 2);
    for (const version of ['3.25.75', '4.6.5', '3.25.77']) {
      lay(version);
      assert.throws(() => securityBackports(root), /Unreviewed zod version/);
    }
    for (const version of ['4.6.6', '4.7.0', '5.0.0']) {
      lay(version);
      assert.equal(securityBackports(root).filter(change => change.package === 'zod').length, 0);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const issueSummary = result => result.error.issues.map(issue => [issue.code, issue.path.join('.'), issue.message, issue.maximum ?? issue.minimum, issue.exact]);
const big = n => new Array(n).fill(1);

// Run the same cases against the module as @expo/cli loads it (CommonJS) and as an import resolves it (ESM).
const zodVariants = [
  ['require', () => cliRequire('zod').z],
  ['import', async () => (await import(pathToFileURL(join(nestedZod, 'index.js')))).z],
];
for (const [name, load] of zodVariants) {
  test(`patched zod (${name}): an oversized array or set fails with one size issue and no element is parsed`, async () => {
    const z = await load();
    let parsed = 0;
    const counted = z.string().refine(() => { parsed++; return true; });
    const one = (schema, input, code, expected) => {
      const result = schema.safeParse(input);
      assert.equal(result.success, false);
      assert.deepEqual(issueSummary(result).map(row => row[0]), [code]);
      assert.deepEqual(issueSummary(result)[0].slice(1), expected);
    };
    one(z.array(z.string()).max(2), big(200000), 'too_big', ['', 'Array must contain at most 2 element(s)', 2, false]);
    one(z.array(z.string()).max(2, 'too many'), big(200000), 'too_big', ['', 'too many', 2, false]);
    one(z.array(z.string()).length(2), big(200000), 'too_big', ['', 'Array must contain exactly 2 element(s)', 2, true]);
    one(z.array(z.string()).length(2, 'exactly two'), big(3), 'too_big', ['', 'exactly two', 2, true]);
    one(z.set(z.string()).max(2), new Set(big(200000).map((_, i) => i)), 'too_big', ['', 'Invalid input', 2, false]);
    one(z.set(z.string()).size(2), new Set(big(200000).map((_, i) => i)), 'too_big', ['', 'Invalid input', 2, false]);
    one(z.object({ list: z.array(z.string()).max(1) }), { list: big(50000) }, 'too_big', ['list', 'Array must contain at most 1 element(s)', 1, false]);
    assert.equal(z.array(counted).max(2).safeParse(['a', 'b', 'c']).success, false);
    assert.equal(z.array(counted).length(2).safeParse(['a', 'b', 'c']).success, false);
    assert.equal(z.set(counted).max(1).safeParse(new Set(['a', 'b'])).success, false);
    assert.equal(parsed, 0, 'no element parsed once the input is over its bound');
    const asynchronous = await z.array(z.string()).max(2).safeParseAsync(big(200000));
    assert.deepEqual(issueSummary(asynchronous).map(row => row[0]), ['too_big']);
    const both = z.array(z.string()).length(2).max(3).safeParse(big(10));
    assert.deepEqual(issueSummary(both).map(row => row[0]), ['too_big', 'too_big'], 'each existing size issue is still reported');
  });

  test(`patched zod (${name}): in-bound and too-small inputs behave as before`, async () => {
    const z = await load();
    const rows = result => issueSummary(result).map(row => row.slice(0, 2));
    assert.deepEqual(rows(z.array(z.string()).max(5).safeParse(['a', 1, 2])), [['invalid_type', '1'], ['invalid_type', '2']]);
    assert.deepEqual(rows(z.array(z.string()).length(3).safeParse(['a', 1, 'c'])), [['invalid_type', '1']]);
    assert.deepEqual(rows(z.array(z.string()).min(3).max(5).safeParse([1])), [['too_small', ''], ['invalid_type', '0']]);
    assert.deepEqual(rows(z.array(z.string()).nonempty().safeParse([])), [['too_small', '']]);
    assert.deepEqual(z.array(z.string()).max(2).parse(['a', 'b']), ['a', 'b']);
    assert.deepEqual(z.array(z.string()).parse(big(0)), []);
    assert.equal(z.array(z.string()).safeParse(big(5)).error.issues.length, 5, 'an unbounded array still reports every element');
    assert.deepEqual(rows(z.array(z.string()).max(2).safeParse('not an array')), [['invalid_type', '']]);
    assert.deepEqual(rows(z.set(z.string()).max(5).safeParse(new Set(['a', 1]))), [['invalid_type', '1']]);
    assert.deepEqual(rows(z.set(z.string()).min(3).safeParse(new Set(['a']))), [['too_small', '']]);
    assert.deepEqual([...z.set(z.string()).max(2).parse(new Set(['a', 'b']))], ['a', 'b']);
    assert.equal(z.set(z.string()).safeParse(new Set(big(5).map((_, i) => i))).error.issues.length, 5);
  });
}

test('the same oversized array on the unpatched zod 3.25.76 produces one issue per element', () => {
  const root = mkdtempSync(join(tmpdir(), 'warehouse-zod-regression-'));
  try {
    cpSync(nestedZod, join(root, 'zod'), { recursive: true });
    for (const spec of zodFiles) writeFileSync(join(root, 'zod', spec.file), originalSource(spec));
    const { z } = createRequire(join(root, 'x.cjs'))('./zod/index.cjs');
    assert.equal(z.array(z.string()).max(2).safeParse(big(2000)).error.issues.length, 2001);
    assert.equal(z.set(z.string()).max(2).safeParse(new Set(big(2000).map((_, i) => i))).error.issues.length, 2001);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
