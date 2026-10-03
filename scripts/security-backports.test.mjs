import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { generateKeyPairSync, sign, constants } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
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

function originalSource(spec) {
  let source = readFileSync(resolve('node_modules', spec.package, spec.file), 'utf8');
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
      mkdirSync(join(directory, 'lib'), { recursive: true });
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
