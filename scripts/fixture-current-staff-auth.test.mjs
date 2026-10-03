import test from 'node:test';import assert from 'node:assert/strict';import {currentStaffAuthenticationMode,currentStaffAuthenticationBefore,currentStaffAuthenticationAfter} from './fixture-auth-controls.mjs';
const c={currentStaffAuthentication:true,kind:'native-current-staff-login',phone:'919888888874',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',role:'staff',expected:'authenticated',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',noAutomaticRetry:true,artifactSHA256:'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69'};
test('current staff requires real approved role and one ordinary session with protected state preserved',()=>{
 assert.equal(currentStaffAuthenticationMode(c,false,false),true);const b={profile:{id:c.profileId,name:c.profileName,role:'staff',active:true,status:'approved'},sessions:[],otpVerified:3,quota:{hourly:0,daily:3},businessHash:'a'.repeat(64),otherAuthHash:'b'.repeat(64),profileStaticHash:'c'.repeat(64),targetAssignments:[],enrollmentTokenCount:0};const a={...b,otpVerified:4,quota:{hourly:1,daily:4},sessions:[{id:'11111111-1111-4111-8111-111111111111',rowSHA256:'a'.repeat(64)}]};currentStaffAuthenticationAfter(c,b,a);
 for(const patch of [{role:'supervisor'},{artifactSHA256:'f'.repeat(64)},{customerReadOnly:true},{currentStaffAuthentication:'true'}])assert.throws(()=>currentStaffAuthenticationMode({...c,...patch},false,false));assert.throws(()=>currentStaffAuthenticationBefore(c,{...b,profile:{...b.profile,role:'supervisor'}}));assert.throws(()=>currentStaffAuthenticationAfter(c,b,{...a,businessHash:'changed'}));assert.throws(()=>currentStaffAuthenticationAfter(c,b,{...a,sessions:[]}));
});

import { CURRENT_FIXTURE_SHA256, CURRENT_FIXTURE_BINDING } from './fixture-current-candidate.mjs';
test('new staff login accepts only the exact audited candidate with existing identity and mode guards',()=>{
 const next={...c,artifactSHA256:CURRENT_FIXTURE_SHA256,candidateBinding:{...CURRENT_FIXTURE_BINDING}};
 assert.equal(currentStaffAuthenticationMode(next,false,false),true);
 for(const patch of [{candidateBinding:undefined},{candidateBinding:{...CURRENT_FIXTURE_BINDING,mobileSource:'f'.repeat(40)}},{candidateBinding:{...CURRENT_FIXTURE_BINDING,architecture:'arm64-v8a'}},{artifactSHA256:'f'.repeat(64)},{role:'admin'},{customerReadOnly:true}])assert.throws(()=>currentStaffAuthenticationMode({...next,...patch},false,false));
 assert.throws(()=>currentStaffAuthenticationMode(next,true,false));assert.throws(()=>currentStaffAuthenticationMode(next,false,true));
});
