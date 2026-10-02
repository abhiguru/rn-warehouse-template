import test from 'node:test';
import assert from 'node:assert/strict';
import {revocationBefore,revocationAfterLogin,revocationAfterDisable,revocationAfterAdminLogout} from './fixture-revocation-controls.mjs';
import {revocationSnapshotSQL} from './fixture-revocation-snapshot.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const c={scope:'isolated-fictional-native-revocation',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',phone:'919888888874',adminProfileId:'f94caa4f-0051-4660-920a-5f41aac86fa7',adminPhone:'919888888871',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',sessionId:id(1),soakConfig:'/private/ui',caseDirectory:'/private/new',otpSocket:'/private/otp.sock'};
const before=()=>({profile:{id:c.profileId,name:c.profileName,role:'customer',active:true,status:'approved'},targetSessions:[{id:id(1),expired:false},{id:id(2),expired:true}],assignments:[{id:id(3),customerId:id(4),active:true}],admin:{id:c.adminProfileId,role:'admin',active:true},adminStaticHash:'c'.repeat(64),adminQuota:{hourly:0,daily:0},adminSessions:[{id:id(5),expired:true}],adminOTPCount:20,targetOTPCount:7,businessHash:'a'.repeat(64),otherAuthHash:'b'.repeat(64)});
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
