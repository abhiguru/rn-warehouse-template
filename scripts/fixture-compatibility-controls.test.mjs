import test from 'node:test';
import assert from 'node:assert/strict';
import {customerCompatibilityMode,navigationBefore} from './fixture-navigation-guards.mjs';
const c={scope:'isolated-fictional-navigation-case',case:'same-server',kind:'native-compatibility-rejection',reservedCustomerCompatibility:true,profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',targetOrigin:'https://backend-switch.example.test',targetInstanceId:'a6efd021-cbf2-42a2-bebf-281551614d93',minimumClientVersion:'0.2.0',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',sessionId:'2775ea9c-149a-4508-a1ed-1d06c7709a67',fixtureGuardSHA256:'a'.repeat(64),backendCheckout:'/fixture/source',backendState:'/fixture/state',soakConfig:'/fixture/config',artifactAudit:'/fixture/audit',caseDirectory:'/fixture/evidence'};
test('compatibility mode requires genuine independent higher-version fixture',()=>{
 assert.equal(customerCompatibilityMode(c),true);
 for(const patch of [{reservedCustomerCompatibility:'true'},{targetInstanceId:'c7ee3314-4dee-4361-81df-7821cdcb1b4a'},{targetOrigin:'https://production.invalid'},{minimumClientVersion:'0.1.0'},{artifactSHA256:'b'.repeat(64)}])assert.throws(()=>customerCompatibilityMode({...c,...patch}));
});
test('compatibility observer refuses mixed modes and non-customer sessions',()=>{
 const s={profile:{id:c.profileId,name:c.profileName,role:'customer',active:true},nativeSessionPresent:true,businessHash:'a'.repeat(64),otherAuthHash:'b'.repeat(64),otpCount:0};
 navigationBefore(c,s);
 assert.throws(()=>navigationBefore({...c,reservedCustomerReceiptDenial:true,targetReceiptId:'a24c256a-bdf3-11f1-97aa-57de57b8fb69'},s));
 assert.throws(()=>navigationBefore(c,{...s,profile:{...s.profile,role:'admin'}}));
 assert.throws(()=>navigationBefore(c,{...s,nativeSessionPresent:false}));
});
