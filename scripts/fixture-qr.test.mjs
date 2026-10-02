import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('native QR controls refuse activation, authentication and ambiguous camera permissions',()=>{
  const q=spawnSync('python3',['-B','-m','unittest','test_qr_controls.py'],{cwd:fileURLToPath(new URL('./fixture-ui/',import.meta.url)),encoding:'utf8',timeout:15000});
  assert.equal(q.status,0,q.stderr);
  assert.match(q.stderr,/Ran 3 tests/);
});
