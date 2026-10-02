import assert from 'node:assert/strict';
// A diagnosed rotation is accepted only with independently bound SQL and HTTP
// evidence. This never changes timestamps, resets quotas or issues credentials.
export function reconcileNativeRenewal(before,after,proof){
 const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;const hash=/^[a-f0-9]{64}$/;
 assert.equal(proof.scope,'readonly-native-refresh-rotation-proof');assert.equal(proof.status,'PASS');assert.match(proof.sessionId,uuid);assert.equal(proof.sessionId,before.nativeSessionId);assert.equal(after.nativeSessionId,before.nativeSessionId);
 for(const k of ['beforeAuthHash','afterAuthHash'])assert.match(proof[k],hash);assert.equal(proof.beforeAuthHash,before.authHash);assert.equal(proof.afterAuthHash,after.authHash);assert.equal(proof.matchingPriorNativeRotationHashes,1);
 assert.equal(proof.refreshHTTPCount,1);assert.equal(proof.refreshHTTPStatus,200);assert.ok(Number.isFinite(Date.parse(proof.refreshAtUTC)));assert.ok(Date.parse(proof.refreshAtUTC)>=Date.parse(proof.beforeUTC)&&Date.parse(proof.refreshAtUTC)<=Date.parse(proof.afterUTC));
 assert.equal(before.nativeSessionExpiryUTC,after.nativeSessionExpiryUTC);assert.equal(proof.sessionExpiryUTC,before.nativeSessionExpiryUTC);assert.equal(before.nativeSessionIssuedUTC,after.nativeSessionIssuedUTC);assert.equal(proof.sessionIssuedUTC,before.nativeSessionIssuedUTC);
 assert.notEqual(before.authHash,after.authHash,'A rotation proof must explain an actual change');
 const omitted=new Set(['authHash','unrelatedAuthHash']);const stable=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!omitted.has(k)));
 assert.deepEqual(stable(after),stable(before),'Nonrotation state changed');
 return {status:'PASS',scope:'exact independently proven native rotation with unchanged protected state; no workflow acceptance'};
}
