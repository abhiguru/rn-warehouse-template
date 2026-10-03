import test from 'node:test';import assert from 'node:assert/strict';
import {confirmedOrdersSwitchTimeline as timeline} from './fixture-confirmed-orders-switch-controls.mjs';
const c={confirmedOrdersResponseSwitch:true,confirmedReadAttemptId:'11111111-1111-4111-8111-111111111111'},native={confirmedReadAttemptId:c.confirmedReadAttemptId,readRequestedUTC:'2026-10-03T00:00:00Z',confirmationAttemptUTC:'2026-10-03T00:00:20Z'};
const start={confirmedReadAttemptId:c.confirmedReadAttemptId,method:'POST',path:'/rest/v1/rpc/get_orders_list',atUTC:'2026-10-03T00:00:01Z',event:'confirmed-orders-delay-start',status:200,delayMs:30000,authorizationPresent:true,credentialQueryPresent:false};
const end={...start,atUTC:'2026-10-03T00:00:31Z',event:'complete',status:200};
test('actual completion after confirmation requires full measured read hold',()=>{const result=timeline(c,native,[start,end]);assert.equal(result.settlement,'delivered-after-confirmation');assert.equal(result.lateDelivery,true);});
test('normal client cancellation is explicit and cannot claim late delivery',()=>{const result=timeline(c,native,[start,{...end,atUTC:'2026-10-03T00:00:21Z',event:'client-response-closed',status:499}]);assert.equal(result.settlement,'cancelled-during-switch');assert.equal(result.lateDelivery,false);});
test('early confirmation settlement, wrong routes, duplicate reads and ambiguous faults refuse',()=>{for(const rows of [[{...start,delayMs:5000},end],[{...start,authorizationPresent:false},end],[start,{...end,atUTC:'2026-10-03T00:00:19Z'}],[start,{...end,event:'upstream-timeout',status:504}],[start,start,end],[start,end,end],[{...start,path:'/rest/v1/rpc/save_grn'},end]])assert.throws(()=>timeline(c,native,rows));assert.throws(()=>timeline({...c,confirmedDraftSwitchBack:true},native,[start,end]));});

test('unrelated automatic completions cannot settle the one held request',()=>{assert.equal(timeline(c,native,[{...end,confirmedReadAttemptId:undefined},start,end]).status,'PASS');assert.throws(()=>timeline(c,native,[start,{...end,confirmedReadAttemptId:'22222222-2222-4222-8222-222222222222'}]));assert.throws(()=>timeline(c,{...native,confirmedReadAttemptId:'bad'},[start,end]));});

import {confirmedOrdersSwitchRefusal as refusal} from './fixture-confirmed-orders-switch-controls.mjs';
test('actual operation refusal must be visible during the read and preserve full state before cold recovery',()=>{
 const config={...c,origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971'},before={source:{businessHash:'a',authHash:'b',session:'owned'},destination:{businessHash:'c',authHash:'d'}};
 const observed={...native,confirmationAttempts:1,businessSubmitAttempts:0,otpRequests:0,actualSwitchCompletions:0,sourceCredentialStoragePresent:true,selection:{origin:config.origin,instanceId:config.instanceId},draftProcessPID:123,sourceProcessPIDBeforeCold:123,operationRefused:true,refusalVisibleUTC:'2026-10-03T00:00:22Z',sourceLogoutCompletions:0,destinationAuthenticatedRequests:0,normalRouteColdOrders200:true,postConfirmationColdLaunchAttempts:1};
 assert.equal(refusal(config,before,globalThis.structuredClone(before),observed,[start,end]).status,'PASS');
 for(const patch of [{refusalVisibleUTC:'2026-10-03T00:00:32Z'},{sourceLogoutCompletions:1},{destinationAuthenticatedRequests:1},{actualSwitchCompletions:1},{sourceCredentialStoragePresent:false},{sourceProcessPIDBeforeCold:124},{normalRouteColdOrders200:false},{postConfirmationColdLaunchAttempts:0},{operationRefused:false}])assert.throws(()=>refusal(config,before,before,{...observed,...patch},[start,end]));
 const changed=globalThis.structuredClone(before);changed.destination.authHash='changed';assert.throws(()=>refusal(config,before,changed,observed,[start,end]));
});

import {spawnSync} from 'node:child_process';
test('read-refusal acknowledgement is narrowly matched and cannot weaken discovery OK guards',()=>{
 const script=`import xml.etree.ElementTree as E
from confirmed_draft_controls import read_refusal_acknowledgement as point
t=E.fromstring('<hierarchy><node text="Operation In Progress"/><node text="Finish the current operation before switching servers."/><node text="OK" class="android.widget.Button" enabled="true" bounds="[540,707][652,791]"/></hierarchy>')
assert point(t)==(596,749)
for title in ['Server Unavailable','Switch Failed','Application Not Responding']:
 t[0].set('text',title)
 try:point(t)
 except AssertionError:pass
 else:raise AssertionError('unrelated alert accepted')
`;
 const r=spawnSync('python3',['-B','-c',script],{cwd:new URL('./fixture-ui/',import.meta.url),encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);
});
