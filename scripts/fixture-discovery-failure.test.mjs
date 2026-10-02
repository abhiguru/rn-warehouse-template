import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {navigationConfig,customerDiscoveryFailureMode} from './fixture-navigation-guards.mjs';
test('discovery failure binds only the reserved customer and owned switching host',()=>{
 const c={scope:'isolated-fictional-navigation-case',case:'same-server',kind:'native-discovery-failure',reservedCustomerDiscoveryFailure:true,origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',targetOrigin:'https://backend-switch.example.test',targetInstanceId:'c7ee3314-4dee-4361-81df-7821cdcb1b4a',networkMarker:'whvm-discovery-0109-01',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',sessionId:'00000000-0000-4000-8000-000000000001',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',fixtureGuardSHA256:'b'.repeat(64),backendCheckout:'/owned/backend',backendState:'/owned/state',soakConfig:'/private/config',artifactAudit:'/private/audit',caseDirectory:'/private/new'};
 navigationConfig(c);assert.equal(customerDiscoveryFailureMode(c),true);
 for(const edit of [{case:'confirm-switch'},{kind:'other'},{targetOrigin:c.origin},{networkMarker:'other'},{reservedCustomerDiscoveryFailure:'true'},{profileName:'Other'},{reservedCustomerLateDiscovery:true}])assert.throws(()=>navigationConfig({...c,...edit}));
});
test('discovery network refuses wrong ownership and requires actual rejected packets',()=>{
 const q=spawnSync('python3',['-B',fileURLToPath(new URL('./fixture-ui/test_discovery_failure_network.py',import.meta.url))],{encoding:'utf8',timeout:10000});assert.equal(q.status,0,q.stderr);
});
