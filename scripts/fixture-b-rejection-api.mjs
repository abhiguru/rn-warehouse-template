import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,fstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,isAbsolute} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {request} from 'node:https';
import {createConnection} from 'node:net';
import {privateJSON,assertReleased} from './fixture-session-guards.mjs';
import {bRejectionConfig,bRejectionBefore} from './fixture-b-rejection-controls.mjs';
import {bRejectionSnapshot} from './fixture-b-rejection-snapshot.mjs';
import {runBRejection} from './fixture-b-rejection-run.mjs';
process.umask(0o077);
let state,out,phase='SOURCE_GUARD';
try{
 const [path,mode]=process.argv.slice(2);assert.ok(['guard','execute'].includes(mode));
 const c=bRejectionConfig(privateJSON(path));assertReleased(c);const ui=privateJSON(c.soakConfig);
 assert.equal(ui.apkSHA256,c.artifactSHA256);assert.equal(createHash('sha256').update(readFileSync(c.soakConfig)).digest('hex'),c.soakConfigSHA256);const scripts=dirname(fileURLToPath(import.meta.url));
 const names=['fixture-b-rejection-api.mjs','fixture-b-rejection-controls.mjs','fixture-b-rejection-run.mjs','fixture-b-rejection-snapshot.mjs','fixture-session-guards.mjs','fixture-ui/b-rejection-api30.py','fixture-b-approval-controls.mjs','fixture-b-approval-snapshot.mjs'];
 assert.deepEqual(Object.keys(c.toolingSHA256).sort(),[...names].sort());
 for(const name of names)assert.equal(createHash('sha256').update(readFileSync(resolve(scripts,name))).digest('hex'),c.toolingSHA256[name]);
 for(const key of ['caseDirectory','soakConfig','otpSocket'])assert.ok(isAbsolute(c[key]));
 assert.ok(isAbsolute(c.helperConfig));assert.equal(createHash('sha256').update(readFileSync(c.helperConfig)).digest('hex'),c.helperConfigSHA256);
 const helper=privateJSON(c.helperConfig);assert.equal(helper.scope,'isolated-fictional-fixture');assert.equal(helper.services.length,1);assert.equal(helper.services[0].kind,'core');
 assert.equal(c.otpSocket,helper.services[0].socketPath);assert.equal(ui.managedUnits.core,'warehouse-fixture-core-'+helper.runId+'.service');
 assert.equal(helper.services[0].owningCheckout,ui.backendCheckout);assert.equal(helper.services[0].ownerGuardSHA256,c.fixtureGuardSHA256);assert.notEqual(helper.services[0].replacementAuthentication,true);assert.equal(helper.services[0].state,ui.backendState);assert.equal(helper.services[0].ordersReadDelayMs??0,0);
 assert.ok(isAbsolute(c.campaignFile));assert.equal(privateJSON(c.campaignFile).deadline,c.campaignDeadlineUTC);
 const deadline=Date.parse(c.deadlineUTC);assert.ok(deadline>Date.now()&&deadline-Date.now()<=3600000);
 assert.ok(deadline<=Date.parse(c.campaignDeadlineUTC));
 const guard=resolve(ui.backendCheckout,'tests/operator-fixture.mjs');assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'),c.fixtureGuardSHA256);
 if(mode==='guard'){console.log('{"status":"PASS","scope":"B rejection source/release/deadline guard only"}');}
 else{
  phase='ACTOR_LOCK';const fd=Number(process.env.WAREHOUSE_B_REJECTION_ACTOR_FD);assert.ok(Number.isSafeInteger(fd)&&fd>=3);
  const lock=resolve(dirname(c.soakConfig),'fixture-session-actor.lock'),a=lstatSync(lock),b=fstatSync(fd);
  assert.ok(a.isFile()&&!a.isSymbolicLink()&&a.uid===process.getuid()&&(a.mode&0o077)===0&&realpathSync(lock)===lock&&a.ino===b.ino&&a.dev===b.dev);
  const acquired=spawnSync('/usr/bin/flock',['--nonblock','3'],{stdio:['ignore','pipe','pipe',fd],timeout:5000});assert.equal(acquired.status,0,'No competing actor permitted');
  process.env.WAREHOUSE_STATE_DIR=ui.backendState;const{operatorFixture}=await import(pathToFileURL(guard).href);const{env,anon}=operatorFixture();
  const ca=readFileSync(ui.primaryCA);
  const call=(route,body,token)=>new Promise((done,reject)=>{
   assert.ok(Date.now()<deadline);assert.ok(['/functions/v1/get-public-config','/functions/v1/operator-otp/request','/functions/v1/operator-otp/verify','/rest/v1/rpc/operator_review_enrollment','/rest/v1/rpc/logout_session'].includes(route));
   const data=body===undefined?undefined:JSON.stringify(body);
   const q=request({hostname:'127.0.0.1',port:18443,servername:'backend-core.example.test',ca,timeout:15000,path:route,method:data?'POST':'GET',headers:{Host:'backend-core.example.test',apikey:anon,...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{})}},r=>{
    let buffer='';r.on('data',p=>{buffer+=p;if(Buffer.byteLength(buffer)>65536)q.destroy(new Error('Bounded response exceeded'));});r.on('error',reject);r.on('end',()=>{try{assert.equal(r.statusCode,200);done(JSON.parse(buffer));}catch{reject(new Error('Owned API response refused'));}});
   });q.on('error',reject);q.on('timeout',()=>q.destroy(new Error('Owned API timeout')));q.end(data);
  });
  const verifyOwnership=async()=>{
   assert.ok(Date.now()<deadline);assertReleased(c);operatorFixture();assert.equal(createHash('sha256').update(readFileSync(c.helperConfig)).digest('hex'),c.helperConfigSHA256);assert.equal(createHash('sha256').update(readFileSync(c.soakConfig)).digest('hex'),c.soakConfigSHA256);for(const name of names)assert.equal(createHash('sha256').update(readFileSync(resolve(scripts,name))).digest('hex'),c.toolingSHA256[name]);for(const row of c.workflowClosure.groups)for(const e of row.evidence)assert.equal(createHash('sha256').update(readFileSync(e.path)).digest('hex'),e.sha256);
   assert.equal(privateJSON(resolve(ui.backendState,'public/instance.json')).instanceId,c.instanceId);
   const q=spawnSync('systemctl',['--user','show',ui.managedUnits.core,'-p','ActiveState','-p','SubState','-p','Restart','-p','NRestarts','-p','RuntimeMaxUSec','-p','ExecStart'],{encoding:'utf8',timeout:5000});assert.equal(q.status,0);
   const props=Object.fromEntries(q.stdout.trim().split('\n').map(x=>{const n=x.indexOf('=');return [x.slice(0,n),x.slice(n+1)];}));assert.equal(props.ActiveState,'active');assert.equal(props.SubState,'running');assert.equal(props.Restart,'no');assert.equal(props.NRestarts,'0');assert.equal(props.RuntimeMaxUSec,'12h');assert.ok(props.ExecStart.includes(resolve(helper.services[0].checkout,'scripts/emulator-fixture-bridge.mjs')));
   const tls=await call('/functions/v1/get-public-config');assert.equal(tls.data.instanceId,c.instanceId);assert.equal(tls.data.canonicalOrigin,c.origin);
   const socket=lstatSync(c.otpSocket);assert.ok(socket.isSocket()&&socket.uid===process.getuid()&&(socket.mode&0o077)===0&&realpathSync(c.otpSocket)===c.otpSocket);
  };
  for(const row of c.workflowClosure.groups)for(const e of row.evidence){const st=lstatSync(e.path);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(st.mode&0o077)===0);assert.equal(createHash('sha256').update(readFileSync(e.path)).digest('hex'),e.sha256);}
  phase='OWNED_TLS_AND_IPC';await verifyOwnership();phase='READONLY_SQL';const before=bRejectionSnapshot(c,env);phase='PRE_OTP_QUOTA_AND_STATE';bRejectionBefore(c,before); // Quota refusal precedes attempt directory/OTP.
  mkdirSync(c.caseDirectory,{mode:0o700});out=resolve(c.caseDirectory,'b-rejection-result.json');state={status:'RUNNING',otpAttempted:false,rejectionAttempted:false,phases:[]};
  const record=async event=>{state.phases.push(event);writeFileSync(out,JSON.stringify(state,null,2)+'\n',{mode:0o600});};
  const challenge=phone=>new Promise((done,reject)=>{
   assert.equal(phone,c.adminPhone);assert.ok(Date.now()<deadline);const s=createConnection(c.otpSocket);let buffer='';s.setTimeout(5000);s.on('connect',()=>s.write(JSON.stringify({phone})+'\n'));
   s.on('data',p=>{buffer+=p;if(Buffer.byteLength(buffer)>2048){s.destroy(new Error('Bounded challenge exceeded'));return;}if(buffer.includes('\n')){s.end();try{const code=JSON.parse(buffer).code;assert.match(code,/^\d{6}$/);done(code);}catch{reject(new Error('Owned challenge unavailable'));}}});s.on('error',reject);s.on('timeout',()=>s.destroy(new Error('Owned challenge timeout')));s.on('end',()=>{if(!buffer.includes('\n'))reject(new Error('Incomplete challenge'));});
  });
  const result=await runBRejection(c,{verifyOwnership,snapshot:async()=>bRejectionSnapshot(c,env),call,challenge,record},state);
  writeFileSync(resolve(c.caseDirectory,'b-rejection-preservation.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});state.status='PASS';await record({phase:'FINAL_APPROVAL_PRESERVATION_PASS'});console.log('{"status":"PASS","scope":"ordinary owned B rejection only"}');
 }
}catch(error){if(state){state.status='FAIL';state.exceptionType=error.name;state.reason='Preserve evidence and uncertain state; no automatic retry or cleanup';writeFileSync(out,JSON.stringify(state,null,2)+'\n',{mode:0o600});}console.error(JSON.stringify({status:'FAIL',category:'B_REJECTION_REFUSED_OR_STOPPED',phase,refusal:error.message?.includes('Ordinary administrator quota exhausted')?'ORDINARY_ADMINISTRATOR_QUOTA_EXHAUSTED':'OWNERSHIP_OR_STATE_REFUSED'}));process.exitCode=1;}
