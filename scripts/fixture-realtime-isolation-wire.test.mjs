import test from 'node:test';import assert from 'node:assert/strict';import{EventEmitter}from'node:events';
import{joinIsolationChannel,reciprocalIsolationEvidence}from'./fixture-realtime-isolation-wire.mjs';
const base={origin:'https://backend-core.example.test',deadlineUTC:new Date(Date.now()+60000).toISOString(),token:'mock-access',anon:'mock-public',ca:'mock-ca',cartA:'ce9cb158-bdb6-11f1-8391-8b2b4fd918b0',cartB:'f3346be6-bdb6-11f1-97b0-638c3f007281',markerA:'FixtureRealtimeIsolation0109A',markerB:'FixtureRealtimeIsolation0109B'};
class Socket extends EventEmitter{
 static sockets=[];
 constructor(url,options){super();assert.ok(url.startsWith('wss://127.0.0.1:18443/'));assert.equal(options.servername,'backend-core.example.test');assert.equal(options.rejectUnauthorized,true);Socket.sockets.push(this);globalThis.queueMicrotask(()=>this.emit('open'));}
 send(raw){const m=JSON.parse(raw);this.topic=m.topic;this.message({event:'phx_reply',ref:m.ref,payload:{status:'ok'}});this.message({event:'system',payload:{status:'ok'}});}
 message(m){this.emit('message',Buffer.from(JSON.stringify({topic:this.topic,...m})));}
 event(which){this.message({event:'postgres_changes',payload:{data:{record:{id:base['cart'+which],note:base['marker'+which]}}}});}
 terminate(){this.emit('close');}
}
test('reciprocal wire proof requires both positive controls and live denied channels',async()=>{
 Socket.sockets=[];const channels=await Promise.all(['A','B','admin'].map(role=>joinIsolationChannel(Socket,{...base,role})));
 try{assert.throws(()=>reciprocalIsolationEvidence(channels));Socket.sockets[0].event('A');Socket.sockets[1].event('B');Socket.sockets[2].event('A');Socket.sockets[2].event('B');assert.equal(reciprocalIsolationEvidence(channels).status,'PASS');Socket.sockets[0].event('B');assert.throws(()=>reciprocalIsolationEvidence(channels),/A received B event/);}finally{channels.forEach(c=>c.close());}
});
test('disconnect and malformed or oversized payloads invalidate negative evidence',async()=>{
 for(const mode of ['close','malformed','oversized']){Socket.sockets=[];const channel=await joinIsolationChannel(Socket,{...base,role:'B'});const socket=Socket.sockets[0];if(mode==='close')socket.terminate();if(mode==='malformed')socket.emit('message',Buffer.from('{'));if(mode==='oversized')socket.emit('message',Buffer.alloc(65537));assert.throws(()=>channel.evidence());channel.close();}
});

test('pre-readiness disconnect refuses once without recursive recovery',async()=>{class EarlyClose extends Socket{send(){this.emit('close');}}await assert.rejects(joinIsolationChannel(EarlyClose,{...base,role:'B'}),/Owned Realtime channel refused/);});
