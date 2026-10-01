import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingReadOnlyMode,approvedEnrollmentExitMode} from './fixture-auth-controls.mjs';
const c=()=>({pendingReadOnly:true,phone:'919888888874',profileName:'New customer',expected:'pending'});
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
