import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingReadOnlyMode,approvedEnrollmentExitMode,customerReadOnlyMode,disabledAuthenticationMode,rejectedAuthenticationMode,approvedBAuthenticationMode,approvedBAuthenticationBefore,approvedBAuthenticationAfter} from './fixture-auth-controls.mjs';
const c=()=>({pendingReadOnly:true,phone:'919888888874',profileName:'New customer',expected:'pending'});
test('disabled login binds the genuine disabled B account and refuses other accounts or modes',()=>{
 const config={disabledAuthentication:true,phone:'919888888873',profileName:'Customer B',profileId:'34d9d337-ec2e-4bed-b555-0e8b63dd3aef',role:'customer',expected:'disabled',existingEnrollmentTokenCount:1};
 assert.equal(disabledAuthenticationMode(config,false,false),true);
 assert.throws(()=>disabledAuthenticationMode({...config,existingEnrollmentTokenCount:0},false,false));
 for(const edit of [{disabledAuthentication:'true'},{phone:'919888888874'},{profileId:'00000000-0000-4000-8000-000000000001'},{profileName:'Other'},{role:'admin'},{expected:'authenticated'},{pendingReadOnly:true},{approvedEnrollmentExit:true},{customerReadOnly:true}]) assert.throws(()=>disabledAuthenticationMode({...config,...edit},false,false));
 assert.throws(()=>disabledAuthenticationMode(config,true,false));assert.throws(()=>disabledAuthenticationMode(config,false,true));
 assert.equal(disabledAuthenticationMode({},false,false),false);
});
test('read-only pending admission binds reserved customer and rejects other modes',()=>{
 assert.equal(pendingReadOnlyMode(c(),false,false),true);
 for(const edit of [{pendingReadOnly:'true'},{phone:'919888888871'},{profileName:'Other'},{expected:'authenticated'}]) assert.throws(()=>pendingReadOnlyMode({...c(),...edit},false,false));
 assert.throws(()=>pendingReadOnlyMode(c(),true,false));assert.throws(()=>pendingReadOnlyMode(c(),false,true));
});
test('ordinary authentication keeps its existing default',()=>{assert.equal(pendingReadOnlyMode({},false,false),false);assert.equal(pendingReadOnlyMode({pendingReadOnly:false},true,false),false);});

test('approved enrollment exit refuses another account, identity, pending mode or login mode',()=>{
 const config={...c(),pendingReadOnly:false,approvedEnrollmentExit:true,expected:'authenticated'};assert.equal(approvedEnrollmentExitMode(config,false,false),true);
 for(const edit of [{pendingReadOnly:true},{approvedEnrollmentExit:'true'},{phone:'919888888871'},{expected:'pending'}])assert.throws(()=>approvedEnrollmentExitMode({...config,...edit},false,false));
 assert.throws(()=>approvedEnrollmentExitMode(config,true,false));assert.throws(()=>approvedEnrollmentExitMode(config,false,true));assert.equal(approvedEnrollmentExitMode({},false,false),false);
});

test('customer read admission binds its one native session and refuses staff or another account',()=>{
 const config={...c(),pendingReadOnly:false,customerReadOnly:true,expected:'authenticated',role:'customer',nativeSessionId:'00000000-0000-4000-8000-000000000001'};assert.equal(customerReadOnlyMode(config,false,false),true);
 for(const edit of [{customerReadOnly:'true'},{approvedEnrollmentExit:true},{pendingReadOnly:true},{role:'admin'},{phone:'919888888871'},{nativeSessionId:"x';DELETE"}])assert.throws(()=>customerReadOnlyMode({...config,...edit},false,false));
 assert.throws(()=>customerReadOnlyMode(config,true,false));assert.throws(()=>customerReadOnlyMode(config,false,true));assert.equal(customerReadOnlyMode({},false,false),false);
});

test('rejected authentication requires actual B rejection and rejects disabled or other fixture modes',()=>{
 const config={rejectedAuthentication:true,phone:'919888888873',profileName:'Customer B',profileId:'34d9d337-ec2e-4bed-b555-0e8b63dd3aef',role:'customer',expected:'rejected',existingEnrollmentTokenCount:1};
 assert.equal(rejectedAuthenticationMode(config,false,false),true);
 for(const edit of [{rejectedAuthentication:'true'},{phone:'919888888874'},{profileId:'00000000-0000-4000-8000-000000000001'},{profileName:'Other'},{role:'admin'},{expected:'disabled'},{existingEnrollmentTokenCount:0},{disabledAuthentication:true},{pendingReadOnly:true},{approvedEnrollmentExit:true},{customerReadOnly:true}])assert.throws(()=>rejectedAuthenticationMode({...config,...edit},false,false));
 assert.throws(()=>rejectedAuthenticationMode(config,true,false));assert.throws(()=>rejectedAuthenticationMode(config,false,true));assert.equal(rejectedAuthenticationMode({},false,false),false);
});

const approvedB=()=>({customerBApprovedAuthentication:true,kind:'native-approved-customer-b-login',phone:'919888888873',profileId:'34d9d337-ec2e-4bed-b555-0e8b63dd3aef',profileName:'Customer B',customerId:'a8246002-bdb6-11f1-b1bf-07b1deb5bca2',role:'customer',expected:'authenticated',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7'});
const approvedBefore=()=>{const c=approvedB();return {profile:{id:c.profileId,name:c.profileName,role:'customer',active:true,status:'approved'},sessions:[],targetAssignments:[{userProfileId:c.profileId,customerId:c.customerId,active:true}],businessHash:'a'.repeat(64),otherAuthHash:'b'.repeat(64),profileStaticHash:'c'.repeat(64),enrollmentHash:'d'.repeat(64),enrollmentTokenCount:1,otpVerified:3,quota:{hourly:0,daily:3}};};
test('approved B login refuses wrong identity, artifact, role and mixed authentication modes',()=>{
 const c=approvedB();assert.equal(approvedBAuthenticationMode(c,false,false),true);assert.equal(approvedBAuthenticationMode({},false,false),false);
 for(const patch of [{customerBApprovedAuthentication:'true'},{customerBApprovedAuthentication:false},{customerBApprovedAuthentication:undefined},{phone:'919888888874'},{customerId:c.profileId},{role:'admin'},{expected:'disabled'},{artifactSHA256:'f'.repeat(64)},{customerReadOnly:true},{rejectedAuthentication:true},{kind:'generic-login'}])assert.throws(()=>approvedBAuthenticationMode({...c,...patch},false,false));assert.throws(()=>approvedBAuthenticationMode(c,true,false));assert.throws(()=>approvedBAuthenticationMode(c,false,true));
});
test('approved B pre-OTP gate requires approved assigned logged-out state and ordinary quota',()=>{
 const c=approvedB(),b=approvedBefore();approvedBAuthenticationBefore(c,b);
 for(const patch of [{profile:{...b.profile,active:false,status:'disabled'}},{sessions:[{id:'old'}]},{targetAssignments:[]},{targetAssignments:[{...b.targetAssignments[0],active:false}]},{quota:{hourly:5,daily:3}},{quota:{hourly:0,daily:20}}])assert.throws(()=>approvedBAuthenticationBefore(c,{...b,...patch}));
});
test('approved B ordinary verification adds exactly one session and preserves unrelated state and enrollment',()=>{
 const c=approvedB(),b=approvedBefore(),a={...b,otpVerified:4,quota:{hourly:1,daily:4},sessions:[{id:'11111111-1111-1111-1111-111111111111',created:'2026-10-02T00:00:00Z',expires:'2026-10-09T00:00:00Z',rowSHA256:'e'.repeat(64)}]};assert.equal(approvedBAuthenticationAfter(c,b,a),a.sessions[0].id);
 for(const patch of [{otpVerified:5},{sessions:[]},{sessions:[...a.sessions,...a.sessions]},{enrollmentHash:'f'.repeat(64)},{profileStaticHash:'f'.repeat(64)},{businessHash:'f'.repeat(64)},{quota:{hourly:2,daily:4}},{sessions:[{...a.sessions[0],rowSHA256:undefined}]}])assert.throws(()=>approvedBAuthenticationAfter(c,b,{...a,...patch}));
});
