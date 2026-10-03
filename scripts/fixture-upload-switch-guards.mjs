// Pure admission/reconciliation guards. No ADB, SQL, HTTP or mutation occurs here.
import assert from 'node:assert/strict';
import {isAbsolute} from 'node:path';
import {CURRENT_FIXTURE_SHA256,CURRENT_FIXTURE_BINDING} from './fixture-current-candidate.mjs';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const sha=/^[a-f0-9]{64}$/;
export function uploadSwitchConfig(c){
 assert.equal(c.scope,'isolated-fictional-native-switch-upload');
 assert.equal(c.record,'FXS993');assert.equal(c.artifactSHA256,CURRENT_FIXTURE_SHA256);
 assert.deepEqual(c.candidateBinding,CURRENT_FIXTURE_BINDING);
 assert.equal(c.origin,'https://backend-core.example.test');
 assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
 assert.equal(c.profileId,'f94caa4f-0051-4660-920a-5f41aac86fa7');
 assert.equal(c.backendCheckout,'/home/jay/warehouse-backend-primary-2026100301');
 assert.equal(c.backendState,'/home/jay/warehouse-state/core-backend-test-2026100102');
 assert.equal(c.fixtureGuardSHA256,'005b8d49fdca23ffc4de4426bde033ce90c8f84597d53929d16b0429acc84c37');
 for(const key of ['targetReceiptId','targetLotId','sessionId'])assert.match(c[key],uuid);
 assert.equal(c.noAutomaticRetry,true);
 assert.ok(Number.isInteger(c.nativeAttempt)&&c.nativeAttempt>=1&&c.nativeAttempt<=3);
 for(const key of ['caseDirectory','soakConfig','helperConfig','fixturePreparationProof','imageFixture','campaignFile','extensionPlan'])assert.ok(typeof c[key]==='string'&&isAbsolute(c[key]));
 for(const key of ['soakConfigSHA256','helperConfigSHA256','fixturePreparationProofSHA256','imageFixtureSHA256','extensionPlanSHA256'])assert.match(c[key],sha);
 assert.equal(c.imageFileName,'FXS993-switch-upload.png');
 assert.ok(Number.isInteger(c.compressedFileSize)&&c.compressedFileSize>0&&c.compressedFileSize<=10485760);
 for(const key of ['deadlineUTC','campaignDeadlineUTC'])assert.match(c[key],/(?:Z|[+-]\d{2}:\d{2})$/);
 assert.equal(c.otpRequested,false);assert.equal(c.receiptWriteAllowed,false);assert.equal(c.serverChangeAllowed,false);
 return c;
}
export function uploadSwitchHelper(c,helper){
 uploadSwitchConfig(c);assert.equal(helper.scope,'isolated-fictional-fixture');
 assert.match(helper.runId,/^[a-z0-9][a-z0-9-]{0,39}$/);assert.equal(helper.services.length,1);
 const service=helper.services[0];assert.equal(service.kind,'core');
 assert.equal(service.owningCheckout,c.backendCheckout);assert.equal(service.state,c.backendState);
 assert.equal(service.ownerGuardSHA256,c.fixtureGuardSHA256);
 for(const key of ['confirmedOrdersReadDelayMs','ordersReadDelayMs','dispatchConcurrency','discoveryDelayMs','replacementAuthentication'])assert.equal(Object.hasOwn(service,key),false);
 assert.deepEqual(service.switchUploadHold,{scope:c.scope,milliseconds:30000,grnId:c.targetReceiptId,fileName:'FXS993-switch-upload.webp',fileSize:c.compressedFileSize});
 return service;
}
export function uploadSwitchTarget(c,target){
 uploadSwitchConfig(c);
 assert.deepEqual(target,{receiptId:c.targetReceiptId,record:c.record,customerId:'a823809c-bdb6-11f1-b1be-47a66d90b06d',items:[{id:c.targetLotId,received:1,available:1}],images:[]});
}
export function uploadSwitchAfter(c,before,after){
 uploadSwitchTarget(c,before.target);
 assert.deepEqual({...after.target,images:[]},before.target,'RECEIPT_AND_STOCK_MUST_REMAIN_UNCHANGED');
 assert.equal(after.target.images.length,1);
 const image=after.target.images[0];assert.match(image.id,uuid);
 assert.equal(image.status,'confirmed');assert.equal(image.tokenPresent,false);
 assert.equal(image.mimeType,'image/webp');assert.equal(image.fileSize,c.compressedFileSize);
 assert.equal(image.grnId,c.targetReceiptId);assert.equal(image.imageType,'header');assert.equal(image.itemId,null);
 assert.match(image.path,new RegExp('^headers/'+c.targetReceiptId+'/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}_FXS993-switch-upload\\.webp$'));
 assert.deepEqual(after.protected,before.protected,'UNRELATED_STATE_OR_AUTH_CHANGED');
 const old=before.files,files=after.files;
 assert.ok(old&&files&&typeof old==='object'&&typeof files==='object');
 for(const [path,entry] of Object.entries(old))assert.deepEqual(files[path],entry,'PREEXISTING_STORED_OBJECT_CHANGED');
 const added=Object.keys(files).filter(path=>!Object.hasOwn(old,path));assert.equal(added.length,1);
 assert.ok(added[0].startsWith('stub/stub/grn-images/'+image.path+'/'));
 assert.equal(files[added[0]].size,c.compressedFileSize);assert.match(files[added[0]].sha256,sha);
 return {status:'PASS',newConfirmedImages:1,newStoredObjects:1,stockUnchanged:true};
}
