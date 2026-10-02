import test from 'node:test';
import assert from 'node:assert/strict';
import { realtimeConfig,realtimeBefore,realtimeAfter,claimRealtimeWrite } from './fixture-realtime-controls.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const config=()=>({scope:'isolated-fictional-native-realtime',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',callerPhone:'919888888872',orderId:'ce9cb158-bdb6-11f1-8391-8b2b4fd918b0',record:'FXC701',quantities:[1,2],manualRefreshDuringObservation:false,sessionId:id(1),stockLineId:id(2),customerId:id(3),callerProfileId:id(4),soakConfig:'/private/ui',caseDirectory:'/private/new',prerequisiteEvidence:'/private/proof',otpSocket:'/private/socket'});
function baseline(c){return {nativeProfile:{id:c.profileId,role:'customer',active:true,name:'New customer'},nativeSessionPresent:true,callerProfile:{id:c.callerProfileId,role:'customer',active:true,name:'Customer A'},stock:{id:c.stockLineId,customerId:c.customerId,record:c.record,stock:8,qty:8},cart:{id:c.orderId,customerId:c.customerId,status:'OPEN',revisions:[{historic:'preserve'}]},items:[],businessHash:'a'.repeat(64),otherAuthHash:'b'.repeat(64),cartStaticHash:'c'.repeat(64)};}
function transition(c,b,qty){const a=structuredClone(b);a.items=[{id:id(5),stockLineId:c.stockLineId,quantity:qty,fulfilled:0}];a.cart.revisions.push({by:c.callerProfileId,action:'UPDATE',cart_items:[{quantity:qty}]});return a;}
test('Realtime case refuses manual refresh, another instance, caller, stock or quantity budget',()=>{const c=config();realtimeConfig(c);for(const edit of [{manualRefreshDuringObservation:true},{callerPhone:'919888888871'},{instanceId:id(9)},{quantities:[1,8]},{record:'FXC702'},{stockLineId:"x';DELETE"}])assert.throws(()=>realtimeConfig({...c,...edit}));});
test('fresh add and same-line edit preserve stock, native session and prior revisions',()=>{const c=config(),b=baseline(c),a=transition(c,b,1),e=transition(c,a,2);realtimeBefore(c,b);assert.equal(realtimeAfter(c,b,b,a,'added'),id(5));assert.equal(realtimeAfter(c,b,a,e,'edited'),id(5));});
test('reconciliation refuses duplicate lines, depleted stock, changed history or a replaced edited line',()=>{const c=config(),b=baseline(c),a=transition(c,b,1);for(const mutate of [x=>x.items.push({...x.items[0],id:id(6)}),x=>x.stock.stock=7,x=>x.cart.revisions[0]={historic:'erased'},x=>x.otherAuthHash='d'.repeat(64)]){const bad=structuredClone(a);mutate(bad);assert.throws(()=>realtimeAfter(c,b,b,bad,'added'));}const e=transition(c,a,2);e.items[0].id=id(6);assert.throws(()=>realtimeAfter(c,b,a,e,'edited'));assert.throws(()=>realtimeAfter(c,b,b,a,'retry'));});
test('attempt markers block replay and dependent edits without independent commit/native proof',()=>{
 const ledger={ordinaryCallerAuthentication:true,baselineSQLValidated:true,status:'RUNNING',writes:[]};
 const ready={status:'READY',manualRefreshUsed:false,window:'foreground'};
 const attempted=claimRealtimeWrite(ledger,'added',ready);
 assert.equal(attempted.writes[0].status,'ATTEMPTED_NO_REPLAY');assert.deepEqual(ledger.writes,[]);
 assert.throws(()=>claimRealtimeWrite(attempted,'added',ready));
 assert.throws(()=>claimRealtimeWrite(attempted,'edited',{...ready,window:'reconnected',ownedNetworkRestored:true}));
 const reconciled={...attempted,writes:[{phase:'added',status:'RECONCILED_AND_NATIVE_DELIVERED'}]};
 assert.throws(()=>claimRealtimeWrite(reconciled,'edited',{...ready,window:'reconnected',ownedNetworkRestored:false}));
 const edited=claimRealtimeWrite(reconciled,'edited',{...ready,window:'reconnected',ownedNetworkRestored:true});
 assert.equal(edited.writes.length,2);assert.throws(()=>claimRealtimeWrite(edited,'edited',{...ready,window:'reconnected',ownedNetworkRestored:true}));
 for(const change of [{ordinaryCallerAuthentication:false},{baselineSQLValidated:false},{status:'FAIL'}])assert.throws(()=>claimRealtimeWrite({...ledger,...change},'added',ready));
 assert.throws(()=>claimRealtimeWrite(ledger,'added',{...ready,manualRefreshUsed:true}));
});
