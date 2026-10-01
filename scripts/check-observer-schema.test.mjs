import assert from 'node:assert/strict';
import test from 'node:test';
import {scratchImage,scratchIsolation} from './check-observer-schema.mjs';
const fresh=()=>({Name:'/warehouse-schema-observer-657',Config:{Image:scratchImage,Labels:{'warehouse.exercise':'schema-observer-657'}},
  HostConfig:{NetworkMode:'none',PortBindings:{},Privileged:false,RestartPolicy:{Name:'no'},Memory:1073741824,NanoCpus:1000000000,
    Tmpfs:{'/var/lib/postgresql/data':'rw,size=768m'}},Mounts:[{Type:'tmpfs'}],State:{Running:true}});
test('full-schema scratch check refuses foreign ownership and external state before SQL',()=>{
  scratchIsolation('warehouse-schema-observer-657',fresh());
  for(const name of ['warehouse-existing-db-1','warehouse-schema-observer-../657','other'])
    assert.throws(()=>scratchIsolation(name,fresh()));
  for(const mutate of [c=>c.Config.Labels={},c=>c.Config.Image='postgres:latest',c=>c.HostConfig.NetworkMode='host',
    c=>c.HostConfig.PortBindings={'5432/tcp':[{}]},c=>c.HostConfig.Privileged=true,c=>c.Mounts=[{Type:'bind'}],
    c=>c.Mounts=[{Type:'volume'}],c=>c.HostConfig.Memory=0,c=>c.HostConfig.NanoCpus=0,c=>c.HostConfig.RestartPolicy.Name='always',
    c=>c.HostConfig.Tmpfs={},c=>c.State.Running=false]){
    const c=fresh();mutate(c);assert.throws(()=>scratchIsolation('warehouse-schema-observer-657',c));
  }
});
