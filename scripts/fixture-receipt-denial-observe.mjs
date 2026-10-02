import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {privateJSON,assertReleased} from './fixture-session-guards.mjs';
import {navigationSnapshotSQL,navigationBefore} from './fixture-navigation-guards.mjs';
import {receiptDenialConfig,receiptDenialTarget,receiptDenialPreserved,receiptRpcCounts} from './fixture-receipt-denial-controls.mjs';
process.umask(0o077);
try {
 const [path,phase,since]=process.argv.slice(2),c=receiptDenialConfig(privateJSON(path));assertReleased(c);assert.ok(['guard','before','after','http'].includes(phase));
 const prerequisite=privateJSON(c.prerequisiteEvidence);assert.equal(prerequisite.status,'PASS');assert.equal(prerequisite.readOnly,true);
 assert.ok(prerequisite.snapshot.receipts.some(x=>x.id===c.targetReceiptId&&x.record==='FXC702'&&x.customer==='Backend Test Customer B'));
 if(phase==='guard'){console.log('{"status":"PASS","scope":"receipt-denial-release-and-target-guard"}');}
 else {
  const guard=resolve(c.backendCheckout,'tests/operator-fixture.mjs');assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'),c.fixtureGuardSHA256);assert.equal(privateJSON(resolve(c.backendState,'public/instance.json')).instanceId,c.instanceId);
  process.env.WAREHOUSE_STATE_DIR=c.backendState;const{operatorFixture}=await import(pathToFileURL(guard).href);const{env}=operatorFixture();
  if(phase==='http'){
   const when=Date.parse(since);assert.ok(Number.isFinite(when)&&when<=Date.now()&&Date.now()-when<180000);
   const q=spawnSync('docker',['logs','--since',since,env.WAREHOUSE_PROJECT_NAME+'-kong-1'],{encoding:'utf8',timeout:15000,maxBuffer:8388608});assert.equal(q.status,0,'OWNED_GATEWAY_OBSERVATION_FAILED');
   const counts=receiptRpcCounts((q.stdout??'')+'\n'+(q.stderr??''));assert.equal(counts.failed,0,'RECEIPT_TRANSPORT_FAILED');console.log(JSON.stringify({status:counts.successful>0?'PASS':'WAIT',scope:'sanitized-native-receipt-RPC',...counts}));if(!counts.successful)process.exitCode=3;
  }else{
   let sql=navigationSnapshotSQL(c);sql=sql.replace('COMMIT;',`SELECT jsonb_build_object('id',g.id,'record',g.gr_no,'customer',x.name,'nativeAssigned',EXISTS(SELECT 1 FROM public.users_customers_new WHERE customer_id=g.customer_id AND user_profile_id='${c.profileId}')) FROM public.goodsreceived g JOIN public.customers x ON g.customer_id=x.id WHERE g.id='${c.targetReceiptId}';COMMIT;`);
   const q=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});assert.equal(q.status,0,'OWNED_READONLY_DENIAL_SNAPSHOT_FAILED');const rows=q.stdout.trim().split('\n').map(x=>JSON.parse(x));assert.equal(rows.length,2);const value={snapshot:rows[0],target:rows[1]};receiptDenialTarget(c,value.target);navigationBefore(c,value.snapshot);
   if(phase==='after')receiptDenialPreserved(c,privateJSON(resolve(c.caseDirectory,'denial-before.json')),value);
   writeFileSync(resolve(c.caseDirectory,'denial-'+phase+'.json'),JSON.stringify({status:'PASS',readOnly:true,...value},null,2)+'\n',{flag:'wx',mode:0o600});console.log('{"status":"PASS","scope":"readonly-native-receipt-denial-preservation"}');
  }
 }
}catch{console.error('{"status":"FAIL","category":"RECEIPT_DENIAL_OBSERVER_REFUSED"}');process.exitCode=1;}
