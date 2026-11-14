// Documentation pins: the identity repository is public and linked the same way everywhere.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const markdown = spawnSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);

test('no tracked markdown file calls the identity repository private', () => {
  assert.ok(markdown.length > 5, 'markdown files were listed');
  for (const file of markdown) {
    const lines = readFileSync(join(root, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/central-identity|identity (?:repository|service|template)/i.test(line)) return;
      assert.doesNotMatch(line, /(?:repository|template|service|it) is private|\(private\b|private;|ask the association|private repo/i, `${file}:${i + 1}`);
    });
  }
});

test('every link to the identity repository is the public repository link, with one owner', () => {
  const owners = new Set();
  let links = 0;
  for (const file of markdown) {
    for (const m of readFileSync(join(root, file), 'utf8').matchAll(/github\.com\/([A-Za-z0-9-]+)\/(central-identity[\w-]*)/g)) {
      assert.equal(m[2], 'central-identity-template', `${file}: ${m[0]}`);
      owners.add(m[1]);
      links += 1;
    }
  }
  assert.ok(links >= 2, 'the README and the central sign-in document link it');
  // abhiguru until the move to the gurucold account (WH-135); then gurucold. Never a mix.
  assert.equal(owners.size, 1, `one owner in all links: ${[...owners]}`);
  assert.match([...owners][0], /^(abhiguru|gurucold)$/);
});

test('the README links the identity repository as optional and open', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(readme, /\[central-identity-template\]\(https:\/\/github\.com\/(?:abhiguru|gurucold)\/central-identity-template\)/);
  assert.match(readme, /a single facility does not need it/);
});
