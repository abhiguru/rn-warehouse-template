import assert from 'node:assert/strict';
import test from 'node:test';
import {lateDiscoveryConfig,lateDiscoveryEvents, lateDiscoveryOrdering} from './fixture-late-discovery-controls.mjs';
const start = {atUTC:'2026-10-02T09:00:00.000Z',event:'discovery-delay-start',method:'GET',path:'/functions/v1/get-public-config',status:200,delayMs:3000};
const complete = {...start,atUTC:'2026-10-02T09:00:03.001Z',event:'complete'};
const lines = (...events) => events.map(x => JSON.stringify(x)).join('\n');
test('late discovery admits only the reserved customer and independent fictional target',()=>{
  const c={scope:'isolated-fictional-navigation-case',case:'same-server',kind:'native-late-discovery',reservedCustomerLateDiscovery:true,
    origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',targetOrigin:'https://backend-switch.example.test',targetInstanceId:'c7ee3314-4dee-4361-81df-7821cdcb1b4a',discoveryDelayMs:3000,
    profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',sessionId:'00000000-0000-4000-8000-000000000001',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',fixtureGuardSHA256:'b'.repeat(64),
    backendCheckout:'/owned/backend',backendState:'/owned/state',soakConfig:'/private/config',artifactAudit:'/private/audit',caseDirectory:'/private/new'};
  lateDiscoveryConfig(c);
  for(const edit of [{reservedCustomerLateDiscovery:false},{reservedCustomerLateDiscovery:'true'},{kind:'native-receipt-denial'},{case:'confirm-switch'},{targetOrigin:c.origin},{targetInstanceId:c.instanceId},{discoveryDelayMs:0},{artifactSHA256:'a'.repeat(64)},{reservedCustomerReceiptDenial:true}])assert.throws(()=>lateDiscoveryConfig({...c,...edit}));
});
test('late discovery requires genuine delayed completion after leaving', () => {
  const events = lateDiscoveryEvents(lines(start, complete));
  assert.equal(lateDiscoveryOrdering(events,'2026-10-02T09:00:01.000Z').status,'PASS');
  for (const left of [start.atUTC,complete.atUTC,'invalid']) assert.throws(() => lateDiscoveryOrdering(events,left));
  assert.throws(() => lateDiscoveryOrdering([...events,...events],'2026-10-02T09:00:01.000Z'));
});
test('late discovery refuses failed, ambiguous and unbounded observations', () => {
  for (const change of [{status:499},{event:'client-response-closed'},{method:'POST'},{delayMs:0},{atUTC:'invalid'}]) {
    assert.throws(() => lateDiscoveryEvents(lines({...start,...change},complete)));
  }
  assert.throws(() => lateDiscoveryEvents('x'.repeat(65537)));
  assert.throws(() => lateDiscoveryEvents('{broken'));
  assert.throws(() => lateDiscoveryOrdering(lateDiscoveryEvents(lines(start,{...complete,atUTC:'2026-10-02T09:00:00.500Z'})),'2026-10-02T09:00:00.100Z'));
});
test('late discovery exports only sanitized transport metadata', () => {
  const events=lateDiscoveryEvents(lines({...start,authorization:'must-not-retain',body:'must-not-retain'},complete));
  assert.equal(JSON.stringify(events).includes('must-not-retain'),false);
  assert.equal(lateDiscoveryEvents(lines({...start,path:'other'})).length,0);
});
