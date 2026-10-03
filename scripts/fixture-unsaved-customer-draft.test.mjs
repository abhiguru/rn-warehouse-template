import {spawnSync} from 'node:child_process';
import test from 'node:test';import assert from 'node:assert/strict';
import {navigationConfig,navigationBefore,unsavedCustomerDraftMode} from './fixture-navigation-guards.mjs';
const c={scope:'isolated-fictional-navigation-case',case:'unsaved-customer-draft-cancel',kind:'native-unsaved-customer-draft',draftMarker:'Fixture VM0109 unsaved customer',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',sessionId:'00000000-0000-4000-8000-000000000001',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',targetOrigin:'https://backend-switch.example.test',targetInstanceId:'c7ee3314-4dee-4361-81df-7821cdcb1b4a',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',fixtureGuardSHA256:'a'.repeat(64),backendCheckout:'/owned/backend',backendState:'/owned/state',soakConfig:'/private/ui',artifactAudit:'/private/audit',caseDirectory:'/private/new'};
test('real unsaved customer draft requires its marker, exact supervisor session and independent destination',()=>{
 assert.equal(unsavedCustomerDraftMode(c),true);navigationConfig(c);const s={profile:{id:c.profileId,name:c.profileName,role:'supervisor',active:true},nativeSessionPresent:true,businessHash:'b'.repeat(64),otherAuthHash:'c'.repeat(64),otpCount:7};navigationBefore(c,s);
 for(const edit of [{draftMarker:''},{kind:'native-customer-cancel-switch'},{profileId:c.instanceId},{targetOrigin:c.origin},{targetInstanceId:c.instanceId},{reservedCustomerCancelSwitch:true}])assert.throws(()=>navigationConfig({...c,...edit}));
 for(const role of ['customer','admin','staff'])assert.throws(()=>navigationBefore(c,{...s,profile:{...s.profile,role}}));
});

test('native draft input refuses existing, duplicate, disabled and offscreen fields',()=>{const q=spawnSync('python3',['-B','-m','unittest','test_unsaved_customer_controls.py'],{cwd:new URL('./fixture-ui/',import.meta.url),encoding:'utf8',timeout:10000});assert.equal(q.status,0,q.stderr);});
