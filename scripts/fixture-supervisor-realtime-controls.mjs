import assert from 'node:assert/strict';
export function supervisorConfig(c){
 assert.equal(c.scope,'isolated-fictional-supervisor-realtime');
 assert.equal(c.origin,'https://backend-core.example.test');
 assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
 assert.equal(c.cartA,'ce9cb158-bdb6-11f1-8391-8b2b4fd918b0');
 assert.equal(c.cartB,'f3346be6-bdb6-11f1-97b0-638c3f007281');
 if(Object.hasOwn(c,'currentArtifactRealtime'))assert.equal(typeof c.currentArtifactRealtime,'boolean');
 const current=c.currentArtifactRealtime===true;
 if(Object.hasOwn(c,'supervisorReconnect'))assert.equal(typeof c.supervisorReconnect,'boolean');
 const reconnect=c.supervisorReconnect===true;if(reconnect)assert.equal(current,true);
 if(current)assert.equal(c.artifactSHA256,'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');
 assert.equal(c.markerA,current?(reconnect?'FixtureSupervisorRealtime0110RA':'FixtureSupervisorRealtime0110A'):'FixtureSupervisorRealtime0109A');
 assert.equal(c.markerB,current?(reconnect?'FixtureSupervisorRealtime0110RB':'FixtureSupervisorRealtime0110B'):'FixtureSupervisorRealtime0109B');return c;
}
export function claimSupervisorWrite(c,state,role,channels){
 supervisorConfig(c);assert.ok(Date.now()<Date.parse(c.deadlineUTC));
 assert.equal(state.status,'RUNNING');assert.equal(state.authenticationReconciled,true);
 assert.equal(state.nativeSupervisorReady,true);assert.equal(state.oldNotesPreserved,true);
 assert.deepEqual(channels.map(x=>x.role),['A','supervisor','admin']);
 for(const x of channels)assert.ok(x.joined&&x.databaseReady&&x.live);
 assert.equal(role,state.writes.length===0?'A':'B');assert.ok(state.writes.length<2);
 const claim={role,cartId:c['cart'+role],marker:c['marker'+role],status:'ATTEMPTED_NO_REPLAY'};
 state.writes.push(claim);return claim;
}
export function reconcileSupervisorNote(c,before,previous,after,role){
 supervisorConfig(c);assert.ok(['A','B'].includes(role));
 for(const key of ['businessHash','storageHash','authHash'])assert.deepEqual(after[key],before[key],key+' changed');
 for(const target of ['A','B']){
  const a=after.carts[target],p=previous.carts[target];
  assert.equal(a.id,c['cart'+target]);assert.equal(a.status,'OPEN');
  assert.deepEqual({...a,note:undefined,updated_at:undefined},{...p,note:undefined,updated_at:undefined},'Unintended cart field changed');
  if(target===role)assert.equal(a.note,c['marker'+role]);else assert.deepEqual(a,p,'Other cart changed');
 }
 return {status:'PASS',role,cartId:c['cart'+role],scope:'one reconciled note update; wire/native evidence separate'};
}

export function supervisorReconnectProof(c,cycle){
 supervisorConfig(c);assert.equal(c.supervisorReconnect,true);
 assert.equal(cycle.artifactSHA256,c.artifactSHA256);assert.equal(cycle.status,'PASS');
 assert.equal(cycle.actualDeviceDisconnection,true);assert.equal(cycle.ownedNetworkRestored,true);assert.equal(cycle.manualRefresh,false);
 return cycle;
}
