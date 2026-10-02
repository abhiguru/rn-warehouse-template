import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
test('expiry observer refuses invalid private preparation without leaking sensitive input',()=>{
 const root=mkdtempSync(resolve(tmpdir(),'warehouse-expiry-refusal-'));chmodSync(root,0o700);
 try{
  const path=resolve(root,'invalid.json');writeFileSync(path,JSON.stringify({scope:'production',privateExample:'never-print-this-private-fixture-value'}),{mode:0o600});
  for(const phase of ['invalid','before']){
   const q=spawnSync(process.execPath,['scripts/fixture-natural-expiry-observe.mjs',path,phase],{encoding:'utf8',timeout:20000});
   assert.equal(q.status,2);assert.equal(q.stdout,'');assert.equal(q.stderr.trim(),'{"status":"BLOCKED","category":"NATURAL_EXPIRY_GATE_REFUSED","automaticRetry":false}');
  }
 }finally{rmSync(root,{recursive:true});}
});
