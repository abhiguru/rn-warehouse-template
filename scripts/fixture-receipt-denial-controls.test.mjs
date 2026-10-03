import test from 'node:test';import assert from 'node:assert/strict';
import {receiptDenialConfig,receiptDenialTarget,receiptDenialPreserved,receiptRpcCounts} from './fixture-receipt-denial-controls.mjs';
const id='00000000-0000-4000-8000-000000000001';
const c=()=>({scope:'isolated-fictional-navigation-case',case:'same-server',kind:'native-receipt-denial',origin:'https://backend-core.example.test',reservedCustomerReceiptDenial:true,targetReceiptId:'a24c256a-bdf3-11f1-97aa-57de57b8fb69',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',sessionId:id,backendCheckout:'/owned/backend',backendState:'/owned/state',soakConfig:'/private/ui',artifactAudit:'/private/audit',caseDirectory:'/private/new',artifactSHA256:'a'.repeat(64),fixtureGuardSHA256:'b'.repeat(64)});
test('native denial admission binds the genuine other-customer receipt and rejects fake absence/assignment',()=>{const config=c();receiptDenialConfig(config);const target={id:config.targetReceiptId,record:'FXC702',customer:'Backend Test Customer B',nativeAssigned:false};receiptDenialTarget(config,target);for(const edit of [{nativeAssigned:true},{customer:'Backend Test Customer A'},{id:null}])assert.throws(()=>receiptDenialTarget(config,{...target,...edit}));for(const edit of [{case:'confirm-switch'},{profileName:'Core Demo Administrator'},{origin:'https://foreign.example'},{targetReceiptId:id},{reservedCustomerReceiptDenial:false}])assert.throws(()=>receiptDenialConfig({...config,...edit}));const snapshot={profile:{id:config.profileId,name:'New customer',role:'customer',active:true},nativeSessionPresent:true,otpCount:7,businessHash:'c'.repeat(64),otherAuthHash:'d'.repeat(64)};receiptDenialPreserved(config,{snapshot,target},{snapshot,target});assert.throws(()=>receiptDenialPreserved(config,{snapshot,target},{snapshot:{...snapshot,businessHash:'e'.repeat(64)},target}));});
test('gateway receipt evidence strips queries and records only exact RPC status counts',()=>{const text='"POST /rest/v1/rpc/get_grn_details?token=private HTTP/1.1" 200\n"POST /rest/v1/rpc/get_grn_details HTTP/1.1" 403\n"POST /rest/v1/rpc/get_other HTTP/1.1" 200';assert.deepEqual(receiptRpcCounts(text),{successful:1,failed:1});assert.doesNotMatch(JSON.stringify(receiptRpcCounts(text)),/private|token|query/);});

test('reciprocal native receipt denial binds genuine B account and existing A receipt only',()=>{
 const config={...c(),reservedCustomerReceiptDenial:false,reciprocalCustomerReceiptDenial:true,kind:'native-reciprocal-receipt-denial',profileId:'34d9d337-ec2e-4bed-b555-0e8b63dd3aef',profileName:'Customer B',targetReceiptId:'a2489c56-bdf3-11f1-97a8-8b3d06ae4c97',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7'};
 receiptDenialConfig(config);const target={id:config.targetReceiptId,record:'FXC701',customer:'Backend Test Customer A',nativeAssigned:false};receiptDenialTarget(config,target);
 for(const edit of [{profileName:'New customer'},{profileId:c().profileId},{targetReceiptId:c().targetReceiptId},{reservedCustomerReceiptDenial:true},{reservedCustomerPDF:true},{case:'confirm-switch'},{artifactSHA256:'a'.repeat(64)}])assert.throws(()=>receiptDenialConfig({...config,...edit}));
 const snapshot={profile:{id:config.profileId,name:config.profileName,role:'customer',active:true},nativeSessionPresent:true,otpCount:7,businessHash:'c'.repeat(64),otherAuthHash:'d'.repeat(64)};receiptDenialPreserved(config,{snapshot,target},{snapshot,target});
 assert.throws(()=>receiptDenialTarget(config,{...target,nativeAssigned:true}));
});

test('genuine A APK10 isolation requires exact artifact and identity and preserves customer state',()=>{
 const config={...c(),reservedCustomerReceiptDenial:false,genuineCustomerAReceiptDenial:true,kind:'native-genuine-a-receipt-denial',profileId:'79764e1a-3aed-4cac-9a25-42ccdafb79ac',profileName:'Customer A',artifactSHA256:'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69',nativeAttempt:1,noAutomaticRetry:true};
 receiptDenialConfig(config);
 const target={id:config.targetReceiptId,record:'FXC702',customer:'Backend Test Customer B',nativeAssigned:false};
 const snapshot={profile:{id:config.profileId,name:config.profileName,role:'customer',active:true},nativeSessionPresent:true,otpCount:7,businessHash:'c'.repeat(64),otherAuthHash:'d'.repeat(64)};
 receiptDenialPreserved(config,{snapshot,target},{snapshot,target});
 for(const edit of [{profileId:c().profileId},{profileName:'New customer'},{artifactSHA256:'a'.repeat(64)},{reservedCustomerReceiptDenial:true},{reservedCustomerPDF:true},{nativeAttempt:4},{noAutomaticRetry:false},{targetReceiptId:id}])assert.throws(()=>receiptDenialConfig({...config,...edit}));
 assert.throws(()=>receiptDenialTarget(config,{...target,nativeAssigned:true}));
 assert.throws(()=>receiptDenialPreserved(config,{snapshot,target},{snapshot:{...snapshot,nativeSessionPresent:false},target}));
});
