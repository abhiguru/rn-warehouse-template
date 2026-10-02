// Bounded fixture transport and native child. No tokens, OTP or raw requests in evidence.
import assert from 'node:assert/strict';
import {setTimeout,clearTimeout} from 'node:timers';
import {readFileSync,writeFileSync,renameSync,mkdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {request} from 'node:https';
import {createConnection} from 'node:net';
import {privateJSON,assertReleased} from './fixture-session-guards.mjs';
import {realtimeConfig} from './fixture-realtime-controls.mjs';
import {realtimeSnapshot} from './fixture-realtime-snapshot.mjs';
import {authenticateRealtimeCaller} from './fixture-realtime-auth.mjs';
import {runRealtime} from './fixture-realtime-run.mjs';
process.umask(0o077);
let state,dir,child;
const save=async value=>{state=value;const tmp=resolve(dir,'realtime-result.tmp');writeFileSync(tmp,JSON.stringify(state,null,2)+'\n',{mode:0o600});renameSync(tmp,resolve(dir,'realtime-result.json'));};
try {
 const path=resolve(process.argv[2]),c=realtimeConfig(privateJSON(path));assertReleased(c);
 const ui=privateJSON(c.soakConfig),scripts=dirname(fileURLToPath(import.meta.url));
 const required=['fixture-realtime-api.mjs','fixture-realtime-run.mjs','fixture-realtime-auth.mjs','fixture-realtime-snapshot.mjs','fixture-realtime-controls.mjs','fixture-session-guards.mjs'];
 for(const n of required)assert.equal(createHash('sha256').update(readFileSync(resolve(scripts,n))).digest('hex'),c.toolingSHA256[n],'FROZEN_REALTIME_TOOLING_CHANGED');
 const guard=resolve(ui.backendCheckout,'tests/operator-fixture.mjs');assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'),c.fixtureGuardSHA256);
 process.env.WAREHOUSE_STATE_DIR=ui.backendState;const {operatorFixture}=await import(pathToFileURL(guard).href);const {anon}=operatorFixture();
 const socketProof=lstatSync(c.otpSocket);assert.ok(socketProof.isSocket()&&socketProof.uid===process.getuid()&&(socketProof.mode&0o077)===0&&realpathSync(c.otpSocket)===c.otpSocket);
 const ca=readFileSync(ui.primaryCA);
 const call=(path,body,token)=>new Promise((done,reject)=>{
  if(body!==undefined&&!path.endsWith('/logout_session'))assert.ok(Date.parse(c.deadlineUTC)>Date.now(),'STAGE_DEADLINE_NO_NEW_MUTATION');
  const data=body===undefined?undefined:JSON.stringify(body);
  const q=request({hostname:'127.0.0.1',port:18443,servername:'backend-core.example.test',ca,timeout:15000,path,method:data?'POST':'GET',headers:{Host:'backend-core.example.test',apikey:anon,...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{})}},r=>{
   let buffer='';r.on('data',p=>{buffer+=p;if(buffer.length>1048576)q.destroy(new Error('RESPONSE_TOO_LARGE'));});r.on('error',()=>reject(new Error('NORMAL_API_RESPONSE_FAILED')));
   r.on('end',()=>{try{assert.equal(r.statusCode,200);done(JSON.parse(buffer));}catch{reject(new Error('NORMAL_API_RESPONSE_REFUSED'));}});
  });q.on('error',()=>reject(new Error('NORMAL_API_TRANSPORT_FAILED')));q.on('timeout',()=>q.destroy(new Error('NORMAL_API_TIMEOUT')));q.end(data);
 });
 const discovery=await call('/functions/v1/get-public-config');assert.equal(discovery.data.instanceId,c.instanceId);assert.equal(discovery.data.canonicalOrigin,c.origin);
 for(const unit of Object.values(ui.managedUnits)){
  const q=spawnSync('systemctl',['--user','show',unit,'-p','ActiveState','-p','NRestarts','-p','Restart'],{encoding:'utf8',timeout:5000});assert.equal(q.status,0);assert.match(q.stdout,/ActiveState=active/);assert.match(q.stdout,/NRestarts=0/);assert.match(q.stdout,/Restart=no/);
 }
 const audit=privateJSON(c.artifactAudit);assert.equal(audit.status,'PASS');assert.equal(audit.sha256??audit.artifact?.sha256,c.artifactSHA256);
 // Immutable stage deadline independently bounds parent and its own child.
 assert.ok(Number.isFinite(Date.parse(c.deadlineUTC))&&Date.parse(c.deadlineUTC)>Date.now()&&Date.parse(c.deadlineUTC)-Date.now()<=900000,'BOUNDED_STAGE_DEADLINE_REQUIRED');
 dir=c.caseDirectory;mkdirSync(dir,{mode:0o700});
 state={status:'RUNNING',scope:'native-realtime-foreground-and-reconnect',writes:[],otpAttempted:false,ordinaryCallerAuthentication:false,baselineSQLValidated:false,phases:[],artifactSHA256:c.artifactSHA256,configSHA256:createHash('sha256').update(readFileSync(path)).digest('hex')};await save(state);
 child=spawn('python3',['-B',resolve(scripts,'fixture-ui/realtime-api30.py'),path],{stdio:['pipe','pipe','pipe']});
 const exit=new Promise((done,reject)=>{child.on('error',()=>reject(new Error('NATIVE_START_FAILED')));child.on('exit',(code,signal)=>done({code,signal}));});
 let stderrBytes=0;child.stderr.on('data',p=>{stderrBytes+=p.length;if(stderrBytes>8192)child.stdin.end();});
 const lines=createInterface({input:child.stdout,crlfDelay:Infinity})[Symbol.asyncIterator]();
 const receive=async()=>{
  let timer;try{const next=await Promise.race([lines.next(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('BOUNDED_NATIVE_PROTOCOL_TIMEOUT')),180000);})]);assert.equal(next.done,false);assert.ok(Buffer.byteLength(next.value)<=2048);return JSON.parse(next.value);}finally{clearTimeout(timer);}
 };
 const stopNative=async()=>{child.stdin.end();let timer;try{const q=await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('NATIVE_CLEANUP_NOT_CONFIRMED')),90000);})]);state.nativeExitCode=q.code;await save(state);}finally{clearTimeout(timer);}};
 const timer=setTimeout(()=>child.stdin.end(),Date.parse(c.deadlineUTC)-Date.now());
 const challenge=phone=>new Promise((done,reject)=>{
  const socket=createConnection(c.otpSocket);let buffer='';socket.setTimeout(5000);
  socket.on('connect',()=>socket.write(JSON.stringify({phone})+'\n'));
  socket.on('data',p=>{buffer+=p;if(buffer.length>2048){socket.destroy();reject(new Error('MOCK_IPC_TOO_LARGE'));}else if(buffer.includes('\n')){socket.end();try{const value=JSON.parse(buffer);assert.match(value.code,/^\d{6}$/);done(value.code);}catch{reject(new Error('MOCK_CHALLENGE_REFUSED'));}}});
  socket.on('error',()=>reject(new Error('MOCK_IPC_FAILED')));socket.on('timeout',()=>{socket.destroy();reject(new Error('MOCK_IPC_TIMEOUT'));});
 });
 try {
  await runRealtime(c,{call,receive,save,snapshot:()=>realtimeSnapshot(c),
   authenticate:()=>authenticateRealtimeCaller(c,{call,challenge,snapshot:()=>realtimeSnapshot(c),record:async row=>{state.phases.push(row);await save(state);}},state),
   evidence:async(phase,value)=>writeFileSync(resolve(dir,phase+'-sql.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600}),
   send:async value=>{assert.ok(child.stdin.writable);child.stdin.write(JSON.stringify(value)+'\n');},
   waitNative:async()=>{const q=await exit;assert.equal(q.code,0,'NATIVE_FINAL_CLEANUP_FAILED');},stopNative},state);
 }finally{clearTimeout(timer);}
 console.log('{"status":"PASS","scope":"native-realtime-foreground-and-reconnect"}');
}catch(error){
 if(state){state.status='FAIL';state.category='REALTIME_STOPPED_PRESERVE_AND_RECONCILE';state.exceptionType=error.name;await save(state);}
 child?.stdin.end();console.error('{"status":"FAIL","category":"REALTIME_STOPPED_PRESERVE_AND_RECONCILE"}');process.exitCode=1;
}
