import assert from 'node:assert/strict';import{setTimeout,clearTimeout}from'node:timers';

// Credentials and event payloads remain in memory. The adapter owns TLS/source
// bindings, actor locking, ordinary authentication and independent SQL evidence.
export function joinIsolationChannel(WebSocket,c){
 assert.equal(c.origin,'https://backend-core.example.test');
 assert.ok(Date.parse(c.deadlineUTC)>Date.now());
 assert.ok(typeof c.token==='string'&&c.token.length>0&&c.token.length<16384);
 assert.ok(typeof c.anon==='string'&&c.anon.length>0&&c.anon.length<16384);
 assert.ok(['A','B','admin'].includes(c.role));
 assert.equal(c.cartA,'ce9cb158-bdb6-11f1-8391-8b2b4fd918b0');
 assert.equal(c.cartB,'f3346be6-bdb6-11f1-97b0-638c3f007281');
 return new Promise((resolve,reject)=>{
  const socket=new WebSocket('wss://127.0.0.1:18443/realtime/v1/websocket?apikey='+encodeURIComponent(c.anon)+'&vsn=1.0.0',{
   ca:c.ca,servername:'backend-core.example.test',rejectUnauthorized:true,handshakeTimeout:10000,
   headers:{Host:'backend-core.example.test',apikey:c.anon,Authorization:'Bearer '+c.token},
  });
  const ref='isolation-'+c.role,topic='realtime:public:orders';let joined=false,ready=false,settled=false,closed=false,failure=false,messages=0,bytes=0;
  const counts={A:0,B:0,foreign:0};
  const stop=()=>{closed=true;socket.terminate();};
  const fail=()=>{const pending=!settled;settled=true;failure=true;clearTimeout(timer);stop();if(pending)reject(new Error('Owned Realtime channel refused'));};
  const timer=setTimeout(fail,Math.min(15000,Date.parse(c.deadlineUTC)-Date.now()));
  const control={close:()=>{clearTimeout(timer);stop();},evidence:()=>{
   assert.ok(Date.now()<Date.parse(c.deadlineUTC),'Realtime stage deadline');
   assert.ok(joined&&ready&&!closed&&!failure,'Live acknowledged database subscription required');
   return {role:c.role,joined:true,databaseReady:true,live:true,...counts};
  }};
  socket.once('error',fail);socket.once('close',()=>{closed=true;if(!settled)fail();});
  socket.once('open',()=>socket.send(JSON.stringify({topic,event:'phx_join',ref,payload:{access_token:c.token,config:{broadcast:{ack:false,self:false},presence:{key:''},postgres_changes:[{event:'*',schema:'public',table:'orders'}]}}})));
  socket.on('message',raw=>{
   try{
    assert.ok(++messages<=1000&&(bytes+=raw.length)<=1048576&&raw.length<=65536);
    const m=JSON.parse(raw.toString());assert.equal(m.topic,topic);
    if(m.event==='phx_reply'&&m.ref===ref){assert.equal(m.payload?.status,'ok');joined=true;}
    if(m.event==='system'){assert.equal(m.payload?.status,'ok');ready=true;}
    if(m.event==='phx_error'||m.event==='phx_close')throw new Error('Subscription ended');
    if(m.event==='postgres_changes'){
     assert.ok(joined&&ready);const row=m.payload?.data?.record;assert.ok(row&&typeof row.id==='string');
     if(row.id===c.cartA&&row.note===c.markerA)counts.A++;
     else if(row.id===c.cartB&&row.note===c.markerB)counts.B++;
     else counts.foreign++;
    }
    if(joined&&ready&&!settled){settled=true;clearTimeout(timer);resolve(control);}
   }catch{fail();}
  });
 });
}

export function reciprocalIsolationEvidence(channels){
 const [a,b,admin]=channels.map(c=>c.evidence());
 assert.equal(a.role,'A');assert.equal(b.role,'B');assert.equal(admin.role,'admin');
 assert.ok(a.A>0&&b.B>0&&admin.A>0&&admin.B>0,'Positive controls required for both actual cart changes');
 assert.equal(a.B,0,'A received B event');assert.equal(b.A,0,'B received A event');
 for(const c of [a,b,admin])assert.equal(c.foreign,0,'Unexpected event; preserve and stop');
 return {status:'PASS',scope:'live reciprocal wire delivery/denial counts only; SQL and native checks separate',channels:[a,b,admin]};
}
