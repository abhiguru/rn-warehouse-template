import test from 'node:test';
import assert from 'node:assert/strict';
import {revocationBefore,revocationAfterLogin,revocationAfterDisable,revocationAfterAdminLogout} from './fixture-revocation-controls.mjs';
import {revocationSnapshotSQL} from './fixture-revocation-snapshot.mjs';
import {revocationClosure,revocationGroupProof} from './fixture-revocation-dependencies.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const c={scope:'isolated-fictional-native-revocation',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',phone:'919888888874',adminProfileId:'f94caa4f-0051-4660-920a-5f41aac86fa7',adminPhone:'919888888871',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',sessionId:id(1),soakConfig:'/private/ui',caseDirectory:'/private/new',otpSocket:'/private/otp.sock'};
const before=()=>({profile:{id:c.profileId,name:c.profileName,role:'customer',active:true,status:'approved'},targetSessions:[{id:id(1),expired:false},{id:id(2),expired:true}],assignments:[{id:id(3),customerId:id(4),active:true}],admin:{id:c.adminProfileId,role:'admin',active:true},adminStaticHash:'c'.repeat(64),adminQuota:{hourly:0,daily:0},adminSessions:[{id:id(5),expired:true}],adminOTPCount:20,targetOTPCount:7,businessHash:'a'.repeat(64),otherAuthHash:'b'.repeat(64)});
test('revocation closure refuses pending, omitted or unreconciled capped dependencies',()=>{
 const proof={path:'/private/result',sha256:'a'.repeat(64)},closure={scope:'fictional-native-workflow-closure-before-revocation',profileId:c.profileId,artifactSHA256:c.artifactSHA256,groups:['receipts','orders','dispatch','invoices','documents','realtime','switching','isolation'].map(id=>({id,status:'PASS',evidence:[proof]}))};
 revocationClosure(c,closure);
 const blocked=globalThis.structuredClone(closure);Object.assign(blocked.groups[0],{status:'BLOCKED',attempts:3,noFurtherNativeAttempts:true,reconciliation:proof});revocationClosure(c,blocked);
 for(const edit of [x=>x.groups.pop(),x=>x.groups[0].status='PENDING',x=>x.groups[0].attempts=2,x=>delete x.groups[0].reconciliation,x=>x.groups[0].noFurtherNativeAttempts=false]){
  const value=globalThis.structuredClone(blocked);edit(value);assert.throws(()=>revocationClosure(c,value));
 }
});
test('revocation snapshot is read-only, bounded and covers line/image/idempotency state',()=>{
 const sql=revocationSnapshotSQL(c);assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/statement_timeout='10s'/);assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|ALTER|TRUNCATE)\b/i);
 for(const table of ['invoice_trl','order_items','grn_images','dispatch_images','idempotency_keys','storage.objects'])assert.ok(sql.includes(table));
 assert.doesNotMatch(sql,/'access_token'|'refresh_token'|'token_hash'/);
});
test('revocation requires ordinary available quota and refuses token files/wrong native identity',()=>{
 const s=before();revocationBefore(c,s);
 for(const edit of [{adminQuota:{hourly:0,daily:20}},{targetSessions:[]},{profile:{...s.profile,active:false}}])assert.throws(()=>revocationBefore(c,{...s,...edit}));
 assert.throws(()=>revocationBefore({...c,adminSessionFile:'/private/token'},s));assert.throws(()=>revocationBefore({...c,profileId:id(9)},s));
});
test('ordinary auth, supported disable and owned logout preserve historical sessions and business',()=>{
 const b=before(),login={...b,adminQuota:{hourly:1,daily:1},adminOTPCount:21,adminSessions:[...b.adminSessions,{id:id(6),expired:false}]};assert.equal(revocationAfterLogin(c,b,login),id(6));
 const disabled={...login,profile:{...b.profile,active:false,status:'disabled'},targetSessions:[],assignments:b.assignments.map(x=>({...x,active:false}))};revocationAfterDisable(c,login,disabled);
 assert.throws(()=>revocationAfterDisable(c,login,{...disabled,assignments:[]}));assert.throws(()=>revocationAfterDisable(c,login,{...disabled,businessHash:'c'.repeat(64)}));
 const loggedOut={...disabled,adminSessions:b.adminSessions};revocationAfterAdminLogout(c,disabled,loggedOut,id(6));assert.throws(()=>revocationAfterAdminLogout(c,disabled,{...loggedOut,adminSessions:[]},id(6)));
});

test('revocation refuses historical artifact and narrow evidence promoted to complete groups',()=>{
 const group={id:'switching',status:'PASS'};
 const value={status:'PASS',scope:'fictional-native-workflow-group-proof',workflowGroup:'switching',artifactSHA256:c.artifactSHA256,profileId:c.profileId};
 revocationGroupProof(c,group,value);
 for(const change of [{artifactSHA256:'a'.repeat(64)},{profileId:id(99)},{workflowGroup:'orders'},{scope:'capped-in-flight-orders-switch-refusal-case-only'},{scope:undefined},{status:'BLOCKED'}])assert.throws(()=>revocationGroupProof(c,group,{...value,...change}));
 const blocked={id:'switching',status:'BLOCKED'},proof={...value,status:'BLOCKED',attempts:3,noFurtherNativeAttempts:true};revocationGroupProof(c,blocked,proof);
 for(const change of [{attempts:2},{noFurtherNativeAttempts:false}])assert.throws(()=>revocationGroupProof(c,blocked,{...proof,...change}));
 const reconciled={...value,scope:'fictional-native-workflow-group-reconciliation'};revocationGroupProof(c,blocked,reconciled,true);assert.throws(()=>revocationGroupProof(c,blocked,value,true));
});
