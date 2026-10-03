import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCampaignDeadline } from './fixture-campaign-deadline.mjs';
const original={startedAt:'2026-10-01T16:27:13+00:00',deadline:'2026-10-03T16:27:13+00:00'};
const extension={scope:'authorized-vm-campaign-extension',supersedesDeadline:original.deadline,startedAt:'2026-10-03T17:00:00+00:00',deadline:'2026-10-04T05:00:00+00:00',authorization:'/private/authorization',authorizationSHA256:'b'.repeat(64)};
const c={campaignFile:'/private/campaign',campaignDeadlineUTC:extension.deadline,extensionPlan:'/private/extension',extensionPlanSHA256:'a'.repeat(64)};
const now=Date.parse('2026-10-03T18:00:00+00:00');
function verify(config=c,ext=extension,auth={oldDeadlineSuperseded:true},digest=path=>path==='/private/extension'?'a'.repeat(64):'b'.repeat(64)) {
 return verifyCampaignDeadline(config,path=>({'/private/campaign':original,'/private/extension':ext,'/private/authorization':auth})[path],digest,now);
}
test('original deadline remains required unless an exact bound approved extension is supplied',()=>{
 verifyCampaignDeadline({campaignFile:c.campaignFile,campaignDeadlineUTC:original.deadline},()=>original,()=>assert.fail('No extension read expected'),now);
 verify();
 assert.throws(()=>verifyCampaignDeadline({campaignFile:c.campaignFile,campaignDeadlineUTC:extension.deadline},()=>original,()=>'',now));
});
test('extension refuses changed bindings, missing approval, other scope, expiry and oversized windows',()=>{
 for(const edit of [{scope:'production'},{supersedesDeadline:'other'},{authorization:'relative'},{authorizationSHA256:'bad'},{startedAt:'2026-10-03T19:00:00+00:00'},{startedAt:'2026-10-03T17:00:00'},{deadline:'2026-10-04T05:00:00'},{deadline:'2026-10-03T17:30:00+00:00'},{deadline:'2026-10-05T05:00:00+00:00'}])assert.throws(()=>verify(c,{...extension,...edit}));
 assert.throws(()=>verify(c,extension,{oldDeadlineSuperseded:false}));
 assert.throws(()=>verify(c,extension,{oldDeadlineSuperseded:true},()=> 'c'.repeat(64)));
 for(const edit of [{extensionPlan:'relative'},{extensionPlanSHA256:'bad'},{campaignDeadlineUTC:original.deadline}])assert.throws(()=>verify({...c,...edit}));
});
