import test from 'node:test';import assert from 'node:assert/strict';
import { currentAdministratorMode,currentAdministratorBefore,currentAdministratorAfter } from './fixture-current-admin-auth.mjs';
import { CURRENT_FIXTURE_BINDING,CURRENT_FIXTURE_SHA256 } from './fixture-current-candidate.mjs';
const c={currentAdministratorAuthentication:true,kind:'native-current-administrator-login',phone:'919888888871',profileId:'f94caa4f-0051-4660-920a-5f41aac86fa7',profileName:'Core Demo Administrator',role:'admin',expected:'authenticated',noAutomaticRetry:true,nativeAttempt:1,artifactSHA256:CURRENT_FIXTURE_SHA256,candidateBinding:{...CURRENT_FIXTURE_BINDING},origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971'};
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('administrator login preserves existing sessions and admits exactly one ordinary new session',()=>{
 const b={profile:{id:c.profileId,name:c.profileName,role:'admin',active:true,status:'approved'},sessions:[{id:id(1),rowSHA256:'a'.repeat(64)}],quota:{hourly:2,daily:7},otpVerified:9,businessHash:'b'.repeat(64),otherAuthHash:'c'.repeat(64)};
 const a={...b,quota:{hourly:3,daily:8},otpVerified:10,sessions:[...b.sessions,{id:id(2),rowSHA256:'d'.repeat(64)}]};assert.equal(currentAdministratorAfter(c,b,a),id(2));
 for(const sessions of [[],[a.sessions[1]],[{...b.sessions[0],rowSHA256:'e'.repeat(64)},a.sessions[1]],[...a.sessions,{id:id(3),rowSHA256:'f'.repeat(64)}]])assert.throws(()=>currentAdministratorAfter(c,b,{...a,sessions}));
 assert.throws(()=>currentAdministratorAfter(c,b,{...a,businessHash:'changed'}));assert.throws(()=>currentAdministratorBefore(c,{...b,quota:{hourly:5,daily:7}}));
});
test('administrator mode refuses other artifacts, identities, mixed modes and fourth attempts',()=>{
 assert.equal(currentAdministratorMode(c,false,false),true);
 for(const patch of [{artifactSHA256:'f'.repeat(64)},{phone:'919888888874'},{role:'staff'},{nativeAttempt:4},{currentStaffAuthentication:true},{candidateBinding:{...CURRENT_FIXTURE_BINDING,architecture:'arm64-v8a'}},{currentAdministratorAuthentication:'true'}])assert.throws(()=>currentAdministratorMode({...c,...patch},false,false));
 assert.throws(()=>currentAdministratorMode(c,true,false));assert.throws(()=>currentAdministratorMode(c,false,true));
});
