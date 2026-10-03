import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
test('real scheduler adapter refuses invalid input without creating units or exposing it',()=>{
 const root=mkdtempSync(resolve(tmpdir(),'warehouse-expiry-schedule-refusal-'));chmodSync(root,0o700);
 try{
  const path=resolve(root,'invalid.json');writeFileSync(path,JSON.stringify({scope:'production',privateValue:'never-print-scheduler-input'}),{mode:0o600});
  for(const mode of ['guard','schedule','invalid']){
   const q=spawnSync(process.execPath,['scripts/fixture-natural-expiry-scheduler.mjs',path,mode],{encoding:'utf8',timeout:20000});assert.equal(q.status,2);assert.equal(q.stdout,'');assert.equal(q.stderr.trim(),'{"status":"BLOCKED","category":"NATURAL_EXPIRY_SCHEDULING_REFUSED","automaticRetry":false}');
  }
  const q=spawnSync('/usr/bin/python3',['-B','scripts/fixture-ui/natural-expiry-schedule.py',path],{encoding:'utf8',timeout:5000});assert.equal(q.status,2);assert.equal(q.stderr,'');assert.equal(q.stdout.trim(),'{"status":"BLOCKED","category":"EXPIRY_SCHEDULER_STOPPED","automaticRetry":false}');
 }finally{rmSync(root,{recursive:true});}
});
