import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingReadOnlyMode} from './fixture-auth-controls.mjs';
const c=()=>({pendingReadOnly:true,phone:'919888888874',profileName:'New customer',expected:'pending'});
test('read-only pending admission binds reserved customer and rejects other modes',()=>{
 assert.equal(pendingReadOnlyMode(c(),false,false),true);
 for(const edit of [{pendingReadOnly:'true'},{phone:'919888888871'},{profileName:'Other'},{expected:'authenticated'}]) assert.throws(()=>pendingReadOnlyMode({...c(),...edit},false,false));
 assert.throws(()=>pendingReadOnlyMode(c(),true,false));assert.throws(()=>pendingReadOnlyMode(c(),false,true));
});
test('ordinary authentication keeps its existing default',()=>{assert.equal(pendingReadOnlyMode({},false,false),false);assert.equal(pendingReadOnlyMode({pendingReadOnly:false},true,false),false);});
