import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,mkdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {request} from 'node:https';
import {createConnection} from 'node:net';
import {setTimeout,clearTimeout} from 'node:timers';
import {privateJSON,assertReleased} from './fixture-session-guards.mjs';
import {revocationConfig,revocationBefore} from './fixture-revocation-controls.mjs';
import {revocationSnapshot} from './fixture-revocation-snapshot.mjs';
import {verifyRevocationDependencies} from './fixture-revocation-dependencies.mjs';
import {runRevocation} from './fixture-revocation-run.mjs';
process.umask(0o077);
let state,dir,child,timer,exit;
const save=()=>{const tmp=resolve(dir,'revocation-result.tmp');writeFileSync(tmp,JSON.stringify(state,null,2)+'\n',{mode:0o600});renameSync(tmp,resolve(dir,'revocation-result.json'));};
try {
 const path=resolve(process.argv[2]),c=revocationConfig(privateJSON(path));assertReleased(c);verifyRevocationDependencies(c);
 const ui=privateJSON(c.soakConfig),scripts=dirname(fileURLToPath(import.meta.url));
 for(const n of ['fixture-revocation-api.mjs','fixture-revocation-run.mjs','fixture-revocation-auth.mjs','fixture-revocation-controls.mjs','fixture-revocation-snapshot.mjs','fixture-revocation-dependencies.mjs','fixture-session-guards.mjs'])assert.equal(createHash('sha256').update(readFileSync(resolve(scripts,n))).digest('hex'),c.toolingSHA256[n]);
 assert.ok(Date.parse(c.deadlineUTC)>Date.now()&&Date.parse(c.deadlineUTC)-Date.now()<=3600000);
 const guard=resolve(ui.backendCheckout,'tests/operator-fixture.mjs');assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'),c.fixtureGuardSHA256);
 process.env.WAREHOUSE_STATE_DIR=ui.backendState;const {operatorFixture}=await import(pathToFileURL(guard).href);const {env,anon}=operatorFixture();
 assert.equal(privateJSON(resolve(ui.backendState,'public/instance.json')).instanceId,c.instanceId);
 const socketProof=lstatSync(c.otpSocket);assert.ok(socketProof.isSocket()&&socketProof.uid===process.getuid()&&(socketProof.mode&0o077)===0&&realpathSync(c.otpSocket)===c.otpSocket);
 const snapshot=()=>revocationSnapshot(c,env);revocationBefore(c,snapshot()); // No child or OTP at exhausted quota.
 const ca=readFileSync(ui.primaryCA);
 const allowed=new Set(['/functions/v1/get-public-config','/functions/v1/operator-otp/request','/functions/v1/operator-otp/verify','/rest/v1/rpc/check_session','/rest/v1/rpc/operator_review_enrollment','/rest/v1/rpc/logout_session']);
 const call=(path,body,token)=>new Promise((done,reject)=>{
  assert.ok(allowed.has(path));assert.ok(Date.now()<Date.parse(c.deadlineUTC)||path.endsWith('/logout_session'));
  const data=body===undefined?undefined:JSON.stringify(body);
  const q=request({hostname:'127.0.0.1',port:18443,servername:'backend-core.example.test',ca,timeout:15000,path,method:data?'POST':'GET',headers:{Host:'backend-core.example.test',apikey:anon,...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{})}},res=>{
   let raw='';res.on('data',part=>{raw+=part;if(Buffer.byteLength(raw)>65536)q.destroy(new Error('Bounded response exceeded'));});res.on('error',()=>reject(new Error('Fixture response failed')));res.on('end',()=>{try{assert.ok(res.statusCode===200||(path.endsWith('/check_session')&&res.statusCode===204));done(raw?JSON.parse(raw):null);}catch{reject(new Error('Fixture response refused'));}});
  });q.on('error',()=>reject(new Error('Owned TLS request failed')));q.on('timeout',()=>q.destroy(new Error('Owned request deadline')));q.end(data);
 });
 const discovery=await call('/functions/v1/get-public-config');assert.equal(discovery.data.instanceId,c.instanceId);assert.equal(discovery.data.canonicalOrigin,'https://backend-core.example.test');
 const challenge=phone=>new Promise((done,reject)=>{
  assert.equal(phone,c.adminPhone);const sock=createConnection(c.otpSocket);let raw='';sock.setTimeout(5000);sock.on('connect',()=>sock.write(JSON.stringify({phone})+'\n'));sock.on('data',part=>{raw+=part;if(raw.length>2048){sock.destroy();reject(new Error('Bounded IPC exceeded'));}else if(raw.includes('\n')){sock.end();try{const v=JSON.parse(raw);assert.match(v.code,/^\d{6}$/);done(v.code);}catch{reject(new Error('Mock challenge unavailable'));}}});sock.on('error',()=>reject(new Error('Owned IPC failed')));sock.on('timeout',()=>{sock.destroy();reject(new Error('Owned IPC deadline'));});
 });
 dir=c.caseDirectory;mkdirSync(dir,{mode:0o700});state={status:'RUNNING',otpAttempted:false,disableAttempted:false,phases:[],artifactSHA256:c.artifactSHA256};save();
 child=spawn('python3',['-B',resolve(scripts,'fixture-ui/revocation-api30.py'),path],{stdio:['pipe','pipe','pipe']});
 exit=new Promise((done,reject)=>{child.on('error',()=>reject(new Error('Native actor start failed')));child.on('exit',(code,signal)=>done({code,signal}));});
 let bytes=0;child.stderr.on('data',part=>{bytes+=part.length;if(bytes>8192)child.stdin.end();});
 const lines=createInterface({input:child.stdout,crlfDelay:Infinity})[Symbol.asyncIterator]();
 const receive=async()=>{let timeout;try{const n=await Promise.race([lines.next(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Native actor protocol deadline')),180000);})]);assert.equal(n.done,false);assert.ok(Buffer.byteLength(n.value)<=2048);return JSON.parse(n.value);}finally{clearTimeout(timeout);}};
 timer=setTimeout(()=>child.stdin.end(),Date.parse(c.deadlineUTC)-Date.now());
 assert.deepEqual(await receive(),{status:'READY',scope:'owned-current-native-customer'});
 const result=await runRevocation(c,{snapshot,call,challenge,verifyDependencies:async()=>{assert.ok(child.exitCode===null&&child.signalCode===null&&child.stdin.writable,'Native actor no longer owns execution');assertReleased(c);return verifyRevocationDependencies(c);},record:async value=>{state.phases.push(value);save();},nativeColdLogin:async()=>{
  child.stdin.write('{"status":"DISABLED_AND_RECONCILED"}\n');assert.deepEqual(await receive(),{status:'PASS',scope:'owned-native-revocation-login-required'});
 }},state);
 const ended=await exit;assert.equal(ended.code,0);state.nativeExitCode=ended.code;
 writeFileSync(resolve(dir,'revocation-preservation.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});state.status='PASS';save();console.log('{"status":"PASS","scope":"ordinary administrator disable and owned native cold restoration"}');
}catch(error){
 if(state){state.status='FAIL';state.exceptionType=error.name;state.reason='Revocation stopped; preserve and reconcile; never replay';save();}
 child?.stdin.end();if(exit){let timeout;try{await Promise.race([exit,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Native cleanup deadline')),90000);})]);}catch{/* Preserve stopped actor evidence; do not restart. */}finally{clearTimeout(timeout);}}
 console.error('{"status":"FAIL","category":"REVOCATION_STOPPED_PRESERVE_NO_REPLAY"}');process.exitCode=1;
}finally{clearTimeout(timer);}
