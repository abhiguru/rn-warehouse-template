import assert from 'node:assert/strict';
import {navigationConfig,navigationBefore} from './fixture-navigation-guards.mjs';
import {dispatchSnapshotSQL} from './fixture-dispatch-snapshot.mjs';
import {writeBaseline,committed} from './fixture-write-reconciliation.mjs';
export function normalNavigation(c){return {...c,scope:'isolated-fictional-navigation-case',case:c.currentSupervisorDispatch===true?'supervisor-reads':c.case};}
export function normalDispatch(c){
 assert.equal(c.scope,'isolated-fictional-normal-dispatch');assert.equal(c.kind,'native-normal-dispatch');assert.equal(c.case,'same-server');
 if(Object.hasOwn(c,'currentSupervisorDispatch'))assert.equal(typeof c.currentSupervisorDispatch,'boolean');
 const current=c.currentSupervisorDispatch===true;
 if(current){assert.equal(c.artifactSHA256,'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');}
 navigationConfig(normalNavigation(c));assert.equal(c.sourceReceipt,current?'FXF960':'FXF900');assert.equal(c.sourceQuantity,10);
 const pairs=current?{FXF961:[3,10],FXF962:[7,7]}:{FXF901:[3,10],FXF902:[7,7]};assert.ok(Object.hasOwn(pairs,c.record));assert.equal(c.quantity,pairs[c.record][0]);assert.equal(c.expectedStock,pairs[c.record][1]);assert.match(c.stockLineId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);return c;
}
export function snapshotCase(c){normalDispatch(c);return {...c,scope:'isolated-fictional-dispatch-observation',kind:'dispatch',phase:'before-upstream'};}
export function normalBefore(c,s){normalDispatch(c);writeBaseline(snapshotCase(c),s.dispatch);assert.equal(s.dispatch.stock,c.expectedStock);assert.equal(s.dispatch.sourceBound,true);assert.equal(s.dispatch.sourceLineCount,1);assert.equal(s.dispatch.sourceQuantity,10);assert.equal(s.dispatch.sourceOutOfStock,false);if(c.currentSupervisorDispatch===true)assert.match(s.dispatch.sourceUpdatedBy,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);navigationBefore(normalNavigation(c),s.auth);}
export function normalAfter(c,b,a,submitted){normalBefore(c,b);for(const k of ['profile','otherAuthHash','otpCount','nativeSessionPresent'])assert.deepEqual(a.auth[k],b.auth[k]);assert.equal(a.unrelatedCacheHash,b.unrelatedCacheHash);if(submitted){if(c.currentSupervisorDispatch===true)assert.equal(a.dispatch.sourceUpdatedBy,c.profileId,'Bound source updater must be the native supervisor');assert.equal(a.dispatch.sourceOutOfStock,a.dispatch.stock===0);committed(snapshotCase(c),b.dispatch,a.dispatch);}else assert.deepEqual(a,b);}

export function normalDispatchSQL(c){
 normalDispatch(c);const current=c.currentSupervisorDispatch===true;
 return dispatchSnapshotSQL(snapshotCase(c)).replace("THEN to_jsonb(g)-'updated_at' ELSE","THEN to_jsonb(g)-'updated_at'-'out_of_stock'"+(current?"-'updated_by'":"")+" ELSE").replace("'sourceBound',","'sourceOutOfStock',(SELECT out_of_stock FROM public.goodsreceived WHERE gr_no='"+c.sourceReceipt+"' AND deleted_at IS NULL), "+(current?"'sourceUpdatedBy',(SELECT updated_by FROM public.goodsreceived WHERE gr_no='"+c.sourceReceipt+"' AND deleted_at IS NULL), ":'')+"'sourceBound',");
}
