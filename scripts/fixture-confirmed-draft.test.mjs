import test from 'node:test';import assert from 'node:assert/strict';
import {confirmedDraftConfig,confirmedDraftBefore,confirmedDraftReconcile,confirmedHelperWindow} from './fixture-confirmed-draft-controls.mjs';
import {confirmedDraftSQL} from './fixture-confirmed-draft-snapshot.mjs';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const c={scope:'isolated-fictional-confirmed-draft-switch',artifactSHA256:'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',targetOrigin:'https://backend-switch.example.test',targetInstanceId:'c7ee3314-4dee-4361-81df-7821cdcb1b4a',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',sessionId:'9207d184-ddde-4d5e-bab4-cba48f73287d',draftKind:'customer',backendCheckout:'/owned/core',backendState:'/owned/core-state',targetBackendCheckout:'/owned/switch',targetBackendState:'/owned/switch-state',soakConfig:'/private/ui',caseDirectory:'/private/new',fixtureGuardSHA256:'a'.repeat(64),targetFixtureGuardSHA256:'b'.repeat(64)};
const before={source:{instanceId:c.instanceId,profile:{id:c.profileId,role:'supervisor',active:true,status:'approved'},businessHash:'c'.repeat(64),authExceptNativeHash:'d'.repeat(64),storageHash:'e'.repeat(64),nativeSessionId:c.sessionId,nativeSessionUnexpired:true,nativeSessionHash:'f'.repeat(64),nativeSessionIssuedUTC:'2026-10-02T18:37:01.054553Z',nativeSessionExpiryUTC:'2026-10-09T18:37:01.054553Z',nativeHistoryCount:1},destination:{instanceId:c.targetInstanceId,businessHash:'1'.repeat(64),authExceptNativeHash:'2'.repeat(64),storageHash:'3'.repeat(64)}};
const after=globalThis.structuredClone(before);Object.assign(after.source,{nativeSessionId:null,nativeSessionHash:null,nativeSessionIssuedUTC:null,nativeSessionExpiryUTC:null,nativeSessionUnexpired:false,nativeHistoryCount:0});
const native={artifactSHA256:c.artifactSHA256,confirmationAttempts:1,businessSubmitAttempts:0,otpRequests:0,destinationLoginAttempts:0,destinationLoginRequired:true,postConfirmationColdLaunchAttempts:0,draftProcessPID:123,destinationProcessPID:123,selection:{origin:c.targetOrigin,instanceId:c.targetInstanceId},oldCredentialStoragePresent:false,destinationAuthenticatedRequests:0,sourceLogoutCompletions:1,sourceLogoutStatus:200};
test('different-origin reconciliation explicitly cannot establish cleared drafts or destination login',()=>{for(const draftKind of ['customer','grn','dispatch','invoice']){const result=confirmedDraftReconcile({...c,draftKind},before,after,native);assert.equal(result.draftAcceptance,'NOT_TESTED');assert.equal(result.scope,'confirmed-switch-pre-authentication-reconciliation-only');}});
test('refuse reused state, other artifacts, malformed sessions and replacement disguised as switching',()=>{for(const change of [{backendState:c.targetBackendState},{artifactSHA256:'0'.repeat(64)},{sessionId:"x';DELETE FROM public.orders;--"},{targetOrigin:c.origin},{targetInstanceId:c.instanceId},{draftKind:'cart'}])assert.throws(()=>confirmedDraftConfig({...c,...change}));});
test('surviving session/history, unrelated auth changes and stored-object changes stop acceptance',()=>{for(const change of [{nativeSessionId:c.sessionId},{nativeHistoryCount:1},{storageHash:'0'.repeat(64)},{authExceptNativeHash:'0'.repeat(64)},{businessHash:'0'.repeat(64)}]){const changed=globalThis.structuredClone(after);Object.assign(changed.source,change);assert.throws(()=>confirmedDraftReconcile(c,before,changed,native));}const changed=globalThis.structuredClone(after);changed.destination.authExceptNativeHash='0'.repeat(64);assert.throws(()=>confirmedDraftReconcile(c,before,changed,native));});
test('forwarded credentials, retries and premature destination login fail',()=>{for(const change of [{destinationAuthenticatedRequests:1},{oldCredentialStoragePresent:true},{confirmationAttempts:2},{businessSubmitAttempts:1},{otpRequests:1},{destinationLoginAttempts:1},{sourceLogoutStatus:500},{postConfirmationColdLaunchAttempts:1},{destinationProcessPID:124},{draftProcessPID:0}])assert.throws(()=>confirmedDraftReconcile(c,before,after,{...native,...change}));});
test('source exclusion cannot conceal another session or destination authentication',()=>{confirmedDraftBefore(c,before);const source=confirmedDraftSQL(c,'source'),target=confirmedDraftSQL(c,'destination');assert.ok(source.includes(`WHERE x.id<>'${c.sessionId}'`));assert.ok(source.includes(`WHERE x.session_id<>'${c.sessionId}'`));assert.ok(!target.includes('WHERE x.id<>'));assert.ok(!target.includes('WHERE x.session_id<>'));for(const sql of [source,target])for(const required of ['READ ONLY',"statement_timeout='10s'",'stock_movements','storage.buckets','auth.users','consumed_refresh_tokens'])assert.ok(sql.includes(required));assert.throws(()=>confirmedDraftSQL(c,'other'));});
test('native credential observer refuses inaccessible data instead of treating it as logout',()=>{
 const r=spawnSync('python3',['-B','-m','unittest','test_confirmed_draft_controls.py'],{cwd:fileURLToPath(new URL('./fixture-ui/',import.meta.url)),encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);
});
test('active soak refuses the real observer entrypoint before SQL, native access or attempt creation',()=>{
 const root=mkdtempSync(join(tmpdir(),'warehouse-confirmed-draft-refusal-'));
 try{
  const sentinel=join(root,'unexpected-access'),config=join(root,'case.json');
  writeFileSync(join(root,'systemctl'),`#!/bin/sh\nprintf '%s\\n' '[{"unit":"warehouse-fixture-overnight-sentinel.service","active":"active"}]'\n`,{mode:0o700});
  for(const name of ['docker','adb'])writeFileSync(join(root,name),`#!/bin/sh\ntouch '${sentinel}'\nexit 99\n`,{mode:0o700});
  writeFileSync(config,JSON.stringify({...c,caseDirectory:join(root,'uncreated-attempt')}),{mode:0o600});
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('./fixture-confirmed-draft-observe.mjs',import.meta.url)),config,'before'],{env:{...process.env,PATH:root+':'+process.env.PATH},encoding:'utf8',timeout:10000});
  assert.equal(r.status,1);assert.ok(r.stderr.includes('CONFIRMED_DRAFT_OBSERVATION_REFUSED'));assert.equal(existsSync(sentinel),false);assert.equal(existsSync(join(root,'uncreated-attempt')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('helper cap and monotonic lifetime cannot be extended or inferred from a live socket',()=>{
 const p={RuntimeMaxUSec:'12h',ActiveEnterTimestampMonotonic:'1000000000'};
 confirmedHelperWindow(p,1100,600);
 for(const [props,uptime,remaining] of [[{...p,RuntimeMaxUSec:'24h'},1100,600],[{...p,ActiveEnterTimestampMonotonic:'0'},1100,600],[p,999,600],[p,43600,600],[p,1100,601],[p,1100,0],[p,NaN,600]])assert.throws(()=>confirmedHelperWindow(props,uptime,remaining));
});

import {reconciledObservationFailure} from './fixture-confirmed-draft-auth-controls.mjs';
test('read-only reconciled observation failure preserves FAIL and rejects ambiguous writes or credential forwarding',()=>{
 const hash='9'.repeat(64),binding={confirmedObservationRecovery:true,confirmedCaseSHA256:hash};
 const failed={...native,status:'FAIL',exceptionType:'AssertionError',configSHA256:hash};
 const baseline={configSHA256:hash,snapshot:before};
 const proof={diagnosticOnly:true,originalAttemptStatus:'FAIL',configSHA256:hash,snapshot:after,events:{source:[{event:'complete',method:'POST',path:'/rest/v1/rpc/logout_session',status:200,authorizationPresent:true,credentialQueryPresent:false}],destination:[]},result:confirmedDraftReconcile(c,before,after,native)};
 assert.equal(reconciledObservationFailure(binding,c,baseline,proof,failed).status,'PASS');assert.equal(failed.status,'FAIL');
 for(const change of [{status:'PASS'},{exceptionType:'TimeoutError'},{confirmationAttempts:2},{businessSubmitAttempts:1},{otpRequests:1},{destinationProcessPID:124},{oldCredentialStoragePresent:true}])assert.throws(()=>reconciledObservationFailure(binding,c,baseline,proof,{...failed,...change}));
 for(const mutate of [p=>p.configSHA256='0'.repeat(64),p=>p.snapshot.destination.authExceptNativeHash='0'.repeat(64),p=>p.events.source[0].status=500,p=>p.events.source[0].event='upstream-timeout',p=>p.events.destination.push({authorizationPresent:true,credentialQueryPresent:false}),p=>p.diagnosticOnly=false]){const changed=globalThis.structuredClone(proof);mutate(changed);assert.throws(()=>reconciledObservationFailure(binding,c,baseline,changed,failed));}
});
