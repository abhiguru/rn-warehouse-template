import test from 'node:test';import assert from 'node:assert/strict';
import {staffReadCase,staffHTTP} from './fixture-staff-observation.mjs';import {navigationConfig,navigationBefore,navigationAfter,navigationSnapshotSQL} from './fixture-navigation-guards.mjs';
const c={scope:'isolated-fictional-navigation-case',case:'staff-reads',kind:'native-staff-read',currentStaffControls:true,noAutomaticRetry:true,nativeAttempt:1,profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',sessionId:'11111111-1111-4111-8111-111111111111',artifactSHA256:'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69',fixtureGuardSHA256:'a'.repeat(64),backendCheckout:'/owned/backend',backendState:'/owned/state',soakConfig:'/private/ui',artifactAudit:'/private/audit',caseDirectory:'/private/new'};
test('literal staff requires exact artifact, identity and matched session rather than supervisor substitution',()=>{
 staffReadCase(navigationConfig(c));assert.match(navigationSnapshotSQL(c),/mobile='919888888874'/);
 const b={profile:{id:c.profileId,name:c.profileName,role:'staff',active:true},nativeSessionPresent:true,businessHash:'b'.repeat(64),otherAuthHash:'c'.repeat(64),otpCount:3};navigationBefore(c,b);navigationAfter(c,b,b);
 assert.throws(()=>navigationBefore(c,{...b,profile:{...b.profile,role:'supervisor'}}));assert.throws(()=>navigationAfter(c,b,{...b,nativeSessionPresent:false}));
 for(const patch of [{artifactSHA256:'f'.repeat(64)},{case:'supervisor-reads'},{profileName:'Customer A'},{currentStaffControls:false},{nativeAttempt:4},{noAutomaticRetry:false}])assert.throws(()=>staffReadCase({...c,...patch}));
 assert.deepEqual(staffHTTP('"POST /rest/v1/rpc/get_orders_list?token=PRIVATE HTTP/1.1" 200'),{reads:1,failures:[]});
});

import { CURRENT_FIXTURE_SHA256, CURRENT_FIXTURE_BINDING } from './fixture-current-candidate.mjs';
test('new staff candidate requires the exact installed source pair and preserves attempt caps',()=>{
 const next={...c,artifactSHA256:CURRENT_FIXTURE_SHA256,candidateBinding:{...CURRENT_FIXTURE_BINDING},nativeAttempt:2};
 staffReadCase(navigationConfig(next));
 for(const patch of [{candidateBinding:undefined},{candidateBinding:{...CURRENT_FIXTURE_BINDING,versionCode:2026100312}},{candidateBinding:{...CURRENT_FIXTURE_BINDING,package:'in.gurucold.warehouse'}},{candidateBinding:{...CURRENT_FIXTURE_BINDING,backendSource:'f'.repeat(40)}},{artifactSHA256:'f'.repeat(64)},{nativeAttempt:4},{nativeAttempt:0},{origin:'https://pilot.example.com'},{profileId:'00000000-0000-4000-8000-000000000001'}])assert.throws(()=>staffReadCase({...next,...patch}));
 assert.throws(()=>staffReadCase({...c,candidateBinding:CURRENT_FIXTURE_BINDING}));
});
