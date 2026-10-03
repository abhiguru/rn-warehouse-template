import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('native Realtime controls reject wrong customer, unreconciled protocol and foreign network rules',()=>{
 const q=spawnSync('python3',['-B','-m','unittest','test_realtime_controls.py','test_emulator_offline_network.py'],{cwd:fileURLToPath(new URL('./fixture-ui/',import.meta.url)),encoding:'utf8',timeout:15000});
 assert.equal(q.status,0,q.stderr);
});
