import test from 'node:test';import assert from 'node:assert/strict';
import {CURRENT_FIXTURE_SHA256,CURRENT_FIXTURE_BINDING} from './fixture-current-candidate.mjs';
import {uploadSwitchConfig,uploadSwitchHelper,uploadSwitchTarget,uploadSwitchAfter} from './fixture-upload-switch-guards.mjs';
const id='11111111-1111-4111-8111-111111111111';
const config=()=>({scope:'isolated-fictional-native-switch-upload',record:'FXS993',artifactSHA256:CURRENT_FIXTURE_SHA256,candidateBinding:{...CURRENT_FIXTURE_BINDING},origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',profileId:'f94caa4f-0051-4660-920a-5f41aac86fa7',targetReceiptId:id,targetLotId:id,sessionId:id,noAutomaticRetry:true,nativeAttempt:1,...Object.fromEntries(['caseDirectory','soakConfig','helperConfig','fixturePreparationProof','imageFixture','campaignFile','extensionPlan'].map(k=>[k,'/private/'+k])),...Object.fromEntries(['soakConfigSHA256','helperConfigSHA256','fixturePreparationProofSHA256','imageFixtureSHA256','extensionPlanSHA256','fixtureGuardSHA256'].map(k=>[k,'a'.repeat(64)])),imageFileName:'FXS993-switch-upload.png',compressedFileSize:1234,deadlineUTC:'2026-10-03T20:00:00Z',campaignDeadlineUTC:'2026-10-04T05:08:22Z',otpRequested:false,receiptWriteAllowed:false,serverChangeAllowed:false,backendCheckout:'/home/jay/warehouse-backend-primary-2026100301',backendState:'/home/jay/warehouse-state/core-backend-test-2026100102',fixtureGuardSHA256:'005b8d49fdca23ffc4de4426bde033ce90c8f84597d53929d16b0429acc84c37'});
test('new upload case pins exact installed artifact/account/fixture and never reopens capped cases',()=>{
 assert.equal(uploadSwitchConfig(config()).record,'FXS993');
 for(const change of[{record:'FXF502'},{nativeAttempt:4},{noAutomaticRetry:false},{otpRequested:true},{receiptWriteAllowed:true},{serverChangeAllowed:true},{profileId:id},{artifactSHA256:'a'.repeat(64)},{origin:'https://production.example'},{imageFileName:'other.png'},{compressedFileSize:0},{caseDirectory:'relative'},{sessionId:'bad'},{candidateBinding:{...CURRENT_FIXTURE_BINDING,versionCode:2026100310}}])assert.throws(()=>uploadSwitchConfig({...config(),...change}));
});
test('final reconciliation refuses duplicate/uncertain uploads, stock changes and loss of old stored bytes',()=>{
 const c=config(),path='headers/'+id+'/'+id+'_FXS993-switch-upload.webp';
 const before={targetStorage:[],target:{receiptId:id,record:c.record,customerId:'a823809c-bdb6-11f1-b1be-47a66d90b06d',items:[{id,received:1,available:1}],images:[]},protected:{nativeSessionPresent:true,stateHash:'a'.repeat(64)},files:{old:{size:10,sha256:'a'.repeat(64)}}};
 const after={targetStorage:[{id,bucket:'grn-images',name:path}],target:{...before.target,images:[{id,status:'confirmed',tokenPresent:false,mimeType:'image/webp',fileSize:1234,grnId:id,imageType:'header',itemId:null,path}]},protected:{...before.protected},files:{...before.files,['stub/stub/grn-images/'+path+'/version']:{size:1234,sha256:'b'.repeat(64)}}};
 assert.equal(uploadSwitchAfter(c,before,after).newConfirmedImages,1);
 for(const mutate of[a=>a.targetStorage=[],a=>a.targetStorage[0].name='other',a=>a.target.images.push({...a.target.images[0]}),a=>a.target.images[0].status='pending',a=>a.target.images[0].tokenPresent=true,a=>a.target.items[0].available=0,a=>delete a.files.old,a=>a.files.old.sha256='c'.repeat(64),a=>a.protected.session='new',a=>a.files.extra={size:1,sha256:'d'.repeat(64)}]){
  const changed=structuredClone(after);mutate(changed);assert.throws(()=>uploadSwitchAfter(c,before,changed));
 }
});
test('helper must independently hold this exact upload and target must be fresh',()=>{
 const c=config(),service={kind:'core',owningCheckout:c.backendCheckout,state:c.backendState,ownerGuardSHA256:c.fixtureGuardSHA256,switchUploadHold:{scope:c.scope,milliseconds:30000,grnId:id,fileName:'FXS993-switch-upload.webp',fileSize:1234}},helper={scope:'isolated-fictional-fixture',runId:'upload-01',services:[service]};
 assert.equal(uploadSwitchHelper(c,helper),service);
 for(const change of[{kind:'switch'},{replacementAuthentication:false},{ordersReadDelayMs:0},{state:'/private/other'},{switchUploadHold:{...service.switchUploadHold,milliseconds:30001}}])assert.throws(()=>uploadSwitchHelper(c,{...helper,services:[{...service,...change}]}));
 const target={receiptId:id,record:c.record,customerId:'a823809c-bdb6-11f1-b1be-47a66d90b06d',items:[{id,received:1,available:1}],images:[]};uploadSwitchTarget(c,target);
 for(const change of[{images:[{id}]},{record:'FXF502'},{items:[{id,received:1,available:0}]}])assert.throws(()=>uploadSwitchTarget(c,{...target,...change}));
});
