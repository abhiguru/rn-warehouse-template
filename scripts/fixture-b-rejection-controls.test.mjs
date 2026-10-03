import {spawnSync} from 'node:child_process';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import test from 'node:test';import assert from 'node:assert/strict';
import {bRejectionConfig,bRejectionBefore,bRejectionAfterLogin,bRejectionAfterCommit,bRejectionAfterLogout} from './fixture-b-rejection-controls.mjs';
import {runBRejection} from './fixture-b-rejection-run.mjs';import {bRejectionSnapshotSQL} from './fixture-b-rejection-snapshot.mjs';
const c={scope:'isolated-fictional-b-rejection',profileId:'34d9d337-ec2e-4bed-b555-0e8b63dd3aef',phone:'919888888873',customerId:'a8246002-bdb6-11f1-b1bf-07b1deb5bca2',adminProfileId:'f94caa4f-0051-4660-920a-5f41aac86fa7',adminPhone:'919888888871',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7'};
c.workflowClosure={profileId:c.profileId,artifactSHA256:c.artifactSHA256,noDependentWorkRemaining:true,groups:['reciprocal-receipt','reciprocal-invoice','private-documents','realtime-isolation'].map(group=>({group,status:'PASS',evidence:[{path:'/tmp/source-test-evidence.json',sha256:'a'.repeat(64)}]}))};
const snapshot=()=>({target:{id:c.profileId,name:'Customer B',role:'customer',active:true,status:'approved'},targetSessions:[],assignments:[{id:'retained-assignment',user_profile_id:c.profileId,customer_id:c.customerId,active:true,assigned_by:c.adminProfileId,assigned_at:'2026-10-02T00:00:00Z'}],admin:{id:c.adminProfileId,role:'admin',active:true},adminSessions:[{id:'old'}],adminHourly:0,adminDaily:0,adminOTPCount:20,targetOTPCount:3,businessHash:'a'.repeat(64),otherAuthHash:'b'.repeat(64),targetStaticHash:'c'.repeat(64),adminStaticHash:'d'.repeat(64)});
function stages(){const b=snapshot(),login={...b,adminSessions:[...b.adminSessions,{id:'new'}],adminHourly:1,adminDaily:1,adminOTPCount:21},rejected={...login,target:{...b.target,active:false,status:'rejected'},assignments:b.assignments.map(x=>({...x,active:false}))},final={...rejected,adminSessions:b.adminSessions};return {b,login,rejected,final};}
test('rejection refuses incomplete dependent workflows, wrong identity, active target sessions and exhausted quota',()=>{
 bRejectionConfig(c);bRejectionBefore(c,snapshot());
 for(const patch of [{phone:'919888888874'},{artifactSHA256:'f'.repeat(64)},{workflowClosure:{...c.workflowClosure,noDependentWorkRemaining:false}},{workflowClosure:{...c.workflowClosure,groups:c.workflowClosure.groups.slice(1)}}])assert.throws(()=>bRejectionConfig({...c,...patch}));
 for(const patch of [{targetSessions:[{id:'active'}]},{adminDaily:20},{target:{...snapshot().target,active:false,status:'disabled'}}])assert.throws(()=>bRejectionBefore(c,{...snapshot(),...patch}));
 const blocked={...c,workflowClosure:{...c.workflowClosure,groups:c.workflowClosure.groups.map(x=>({...x,status:'BLOCKED',attempts:3,noFurtherAttempts:true,writesReconciled:true}))}};bRejectionConfig(blocked);blocked.workflowClosure.groups[0].attempts=2;assert.throws(()=>bRejectionConfig(blocked));
});
test('normal rejection only deactivates retained assignment and preserves unrelated authentication and business',()=>{
 const {b,login,rejected,final}=stages();assert.equal(bRejectionAfterLogin(c,b,login),'new');bRejectionAfterCommit(c,login,rejected);bRejectionAfterLogout(c,rejected,final,'new');
 for(const patch of [{assignments:[]},{businessHash:'f'.repeat(64)},{targetOTPCount:4},{adminSessions:[]},{assignments:[{...rejected.assignments[0],assigned_at:'changed'}]}])assert.throws(()=>bRejectionAfterCommit(c,login,{...rejected,...patch}));
 assert.throws(()=>bRejectionAfterLogout(c,rejected,{...final,adminSessions:[]},'new'));assert.throws(()=>bRejectionAfterLogin(c,b,{...login,adminSessions:[{id:'new'}]}));
 const sql=bRejectionSnapshotSQL(c);assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/statement_timeout='10s'/);assert.doesNotMatch(sql,/DELETE FROM|UPDATE public/);
});
function depsFor(queue,mode='success'){
 const calls=[],records=[];return {calls,records,deps:{verifyOwnership:async()=>{},snapshot:async()=>queue.shift(),challenge:async()=> '123456',record:async x=>records.push(x),call:async(path,body)=>{
 calls.push({path,decision:body?.p_decision});if(path.endsWith('/request'))return {success:true};if(path.endsWith('/verify'))return {success:true,data:{user:{id:c.adminProfileId,role:'admin',active:true},session:{access_token:'private-access',refresh_token:'private-refresh'}}};
 if(path.endsWith('/operator_review_enrollment')){assert.equal(body.p_decision,'rejected');assert.deepEqual(body.p_customer_ids,[]);if(mode==='lost')throw Error('Uncertain rejection response');return {success:true,data:{status:'rejected'}};}if(path.endsWith('/logout_session'))return true;throw Error('Unexpected route');
 }}};
}
test('successful rejection independently reconciles commit before only-new-session logout',async()=>{
 const {b,login,rejected,final}=stages(),d=depsFor([b,login,login,rejected,final]),state={otpAttempted:false,rejectionAttempted:false};const out=await runBRejection({...c,deadlineUTC:new Date(Date.now()+60000).toISOString()},d.deps,state);assert.equal(out.status,'PASS');assert.equal(d.calls.filter(x=>x.decision==='rejected').length,1);assert.equal(d.records[2].phase,'ONE_SUPPORTED_B_REJECTION_ATTEMPT');assert.doesNotMatch(JSON.stringify(d.records),/123456|private-access|private-refresh/);
});
test('uncertain rejection response never replays or logs out before reconciliation',async()=>{
 const {b,login}=stages(),d=depsFor([b,login,login],'lost'),state={otpAttempted:false,rejectionAttempted:false},cfg={...c,deadlineUTC:new Date(Date.now()+60000).toISOString()};await assert.rejects(runBRejection(cfg,d.deps,state));assert.equal(state.rejectionAttempted,true);assert.equal(d.calls.some(x=>x.path.endsWith('/logout_session')),false);await assert.rejects(runBRejection(cfg,d.deps,state));assert.equal(d.calls.length,3);
});
test('failed commit preservation stops cleanup and unavailable quota stops OTP',async()=>{
 const {b,login,rejected}=stages(),d=depsFor([b,login,login,{...rejected,businessHash:'f'.repeat(64)}]),cfg={...c,deadlineUTC:new Date(Date.now()+60000).toISOString()};await assert.rejects(runBRejection(cfg,d.deps,{otpAttempted:false,rejectionAttempted:false}));assert.equal(d.calls.some(x=>x.path.endsWith('/logout_session')),false);
 const q=depsFor([{...b,adminDaily:20}]);await assert.rejects(runBRejection(cfg,q.deps,{otpAttempted:false,rejectionAttempted:false}));assert.equal(q.calls.length,0);
});

test('actual adapter refuses missing closure before transport and sanitizes private configuration',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fixture-rejection-refusal-'));try{const file=join(dir,'config.json');writeFileSync(file,JSON.stringify({...c,workflowClosure:undefined,secret:'PRIVATE_SENTINEL'}),{mode:0o600});
 const q=spawnSync(process.execPath,['scripts/fixture-b-rejection-api.mjs',file,'guard'],{encoding:'utf8',timeout:5000});assert.equal(q.status,1);assert.match(q.stderr,/SOURCE_GUARD/);assert.ok(!q.stderr.includes('PRIVATE_SENTINEL'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
