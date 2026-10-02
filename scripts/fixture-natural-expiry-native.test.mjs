import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
test('dedicated expiry executor refuses original device and malformed identities before native operations',()=>{
 const root=mkdtempSync(resolve(tmpdir(),'warehouse-expiry-native-refusal-'));chmodSync(root,0o700);
 try{
  const path=resolve(root,'input.json'),base={scope:'isolated-fictional-dedicated-natural-expiry',avd:'DedicatedExpiry_API30_owned01',serial:'emulator-5580',emulatorUnit:'warehouse-fixture-emulator-expiry-owned01.service'};
  for(const patch of [{scope:'production'},{avd:'TestWarehouseFixture_API30'},{serial:'physical-phone'},{emulatorUnit:'unrelated.service'}]){
   writeFileSync(path,JSON.stringify({...base,...patch,privateExample:'never-print-private-input'}),{mode:0o600});
   const q=spawnSync('/usr/bin/python3',['-B','scripts/fixture-ui/natural-expiry-api30.py',path],{encoding:'utf8',timeout:5000});
   assert.equal(q.status,2);assert.equal(q.stderr,'');assert.equal(q.stdout.trim(),'{"status":"BLOCKED","category":"DEDICATED_NATURAL_EXPIRY_STOPPED","automaticRetry":false}');
  }
 }finally{rmSync(root,{recursive:true});}
});
