import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingReadOnlyMode,approvedEnrollmentExitMode,customerReadOnlyMode,disabledAuthenticationMode} from './fixture-auth-controls.mjs';
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
