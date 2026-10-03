import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('upload-switch controls reject unrelated actions and refusal outside actual hold',()=>{
 const result=spawnSync('python3',['-B','-m','unittest','test_upload_switch_controls.py'],{cwd:new URL('./fixture-ui/',import.meta.url),encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr);
});
