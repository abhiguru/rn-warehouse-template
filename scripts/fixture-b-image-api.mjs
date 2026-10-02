import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,fstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,isAbsolute} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {request} from 'node:https';
import {createConnection} from 'node:net';
import {privateJSON,assertReleased} from './fixture-session-guards.mjs';
import {bImageConfig,bImageBefore} from './fixture-b-image-controls.mjs';
import {bImageSnapshot} from './fixture-b-image-snapshot.mjs';
import {runBImage} from './fixture-b-image-run.mjs';
process.umask(0o077);
let state,out,phase='SOURCE_GUARD';
try{
 const [path,mode]=process.argv.slice(2);assert.ok(['guard','execute'].includes(mode));
 const c=bImageConfig(privateJSON(path));assertReleased(c);const ui=privateJSON(c.soakConfig);
 const scripts=dirname(fileURLToPath(import.meta.url));
 const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
 const names=['fixture-b-image-api.mjs','fixture-b-image-controls.mjs','fixture-b-image-run.mjs','fixture-b-image-snapshot.mjs','fixture-b-image-bytes.mjs','fixture-b-approval-controls.mjs','fixture-b-approval-snapshot.mjs','fixture-session-guards.mjs','fixture-ui/b-image-api30.py'];
 assert.deepEqual(Object.keys(c.toolingSHA256).sort(),[...names].sort());
 for(const name of names)assert.equal(createHash('sha256').update(readFileSync(resolve(scripts,name))).digest('hex'),c.toolingSHA256[name]);
 for(const key of ['caseDirectory','soakConfig','otpSocket'])assert.ok(isAbsolute(c[key]));
 assert.ok(isAbsolute(c.helperConfig));assert.equal(createHash('sha256').update(readFileSync(c.helperConfig)).digest('hex'),c.helperConfigSHA256);
 const helper=privateJSON(c.helperConfig);assert.equal(helper.scope,'isolated-fictional-fixture');assert.equal(helper.services.length,1);assert.equal(helper.services[0].kind,'core');
 assert.equal(c.otpSocket,helper.services[0].socketPath);assert.equal(ui.managedUnits.core,'warehouse-fixture-core-'+helper.runId+'.service');
 assert.equal(helper.services[0].state,ui.backendState);
 assert.ok(isAbsolute(c.campaignFile));assert.equal(privateJSON(c.campaignFile).deadline,c.campaignDeadlineUTC);
 const deadline=Date.parse(c.deadlineUTC);assert.ok(deadline>Date.now()&&deadline-Date.now()<=3600000);
 assert.ok(deadline<=Date.parse(c.campaignDeadlineUTC));
 const guard=resolve(ui.backendCheckout,'tests/operator-fixture.mjs');
 const verifyBindings=()=>{
  assert.ok(Date.now()<deadline);assertReleased(c);
  assert.equal(digest(c.soakConfig),c.soakConfigSHA256);assert.equal(digest(c.helperConfig),c.helperConfigSHA256);assert.equal(digest(guard),c.fixtureGuardSHA256);
  for(const name of names)assert.equal(digest(resolve(scripts,name)),c.toolingSHA256[name]);
  assert.equal(privateJSON(c.campaignFile).deadline,c.campaignDeadlineUTC);
  const h=privateJSON(c.helperConfig).services[0];assert.equal(h.owningCheckout,ui.backendCheckout);assert.equal(h.ownerGuardSHA256,c.fixtureGuardSHA256);assert.equal(h.state,ui.backendState);assert.equal(h.socketPath,c.otpSocket);assert.equal(h.ordersReadDelayMs??0,0);
  for(const p of [c.imageFile,c.preservationProof]){assert.ok(isAbsolute(p));const st=lstatSync(p);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(st.mode&0o077)===0&&realpathSync(p)===p);}
  assert.equal(digest(c.imageFile),c.imageSHA256);assert.equal(readFileSync(c.imageFile).length,c.fileSize);assert.equal(digest(c.preservationProof),c.preservationProofSHA256);
  const proof=privateJSON(c.preservationProof);assert.equal(proof.status,'PASS');assert.equal(proof.instanceId,c.instanceId);assert.equal(proof.state,ui.backendState);assert.equal(proof.databaseCatalogReadable,true);assert.equal(proof.storageCatalogReadable,true);assert.equal(proof.checksumsVerified,true);assert.ok(Date.parse(proof.verifiedUTC)<=Date.now()&&Date.now()-Date.parse(proof.verifiedUTC)<=3600000);
  assert.equal(c.preservationVerified,true);assert.equal(proof.files.length,2);assert.deepEqual(proof.files.map(x=>x.kind).sort(),['database','storage']);
  for(const f of proof.files){assert.ok(isAbsolute(f.path)&&realpathSync(f.path)===f.path);const parent=lstatSync(dirname(f.path));assert.ok(parent.isDirectory()&&!parent.isSymbolicLink()&&parent.uid===process.getuid()&&(parent.mode&0o077)===0);const st=lstatSync(f.path);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(st.mode&0o077)===0);assert.equal(digest(f.path),f.sha256);}
 };verifyBindings();
 if(mode==='guard'){console.log('{"status":"PASS","scope":"B image preparation source/release/deadline guard only"}');}
 else{
  phase='ACTOR_LOCK';const fd=Number(process.env.WAREHOUSE_B_IMAGE_ACTOR_FD);assert.ok(Number.isSafeInteger(fd)&&fd>=3);
  const lock=resolve(dirname(c.soakConfig),'fixture-session-actor.lock'),a=lstatSync(lock),b=fstatSync(fd);
  assert.ok(a.isFile()&&!a.isSymbolicLink()&&a.uid===process.getuid()&&(a.mode&0o077)===0&&realpathSync(lock)===lock&&a.ino===b.ino&&a.dev===b.dev);
  const acquired=spawnSync('/usr/bin/flock',['--nonblock','3'],{stdio:['ignore','pipe','pipe',fd],timeout:5000});assert.equal(acquired.status,0,'No competing actor permitted');
  process.env.WAREHOUSE_STATE_DIR=ui.backendState;const{operatorFixture}=await import(pathToFileURL(guard).href);const{env,anon}=operatorFixture();
  const ca=readFileSync(ui.primaryCA);
  const call=(route,body,token)=>new Promise((done,reject)=>{
   verifyBindings();assert.ok(['/functions/v1/get-public-config','/functions/v1/operator-otp/request','/functions/v1/operator-otp/verify','/rest/v1/rpc/register_grn_image_upload','/rest/v1/rpc/confirm_grn_image_upload','/rest/v1/rpc/logout_session'].includes(route));
   const data=body===undefined?undefined:JSON.stringify(body);
   const q=request({hostname:'127.0.0.1',port:18443,servername:'backend-core.example.test',ca,timeout:15000,path:route,method:data?'POST':'GET',headers:{Host:'backend-core.example.test',apikey:anon,...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{})}},r=>{
    let buffer='';r.on('data',p=>{buffer+=p;if(Buffer.byteLength(buffer)>65536)q.destroy(new Error('Bounded response exceeded'));});r.on('error',reject);r.on('end',()=>{try{assert.equal(r.statusCode,200);done(JSON.parse(buffer));}catch{reject(new Error('Owned API response refused'));}});
   });q.on('error',reject);q.on('timeout',()=>q.destroy(new Error('Owned API timeout')));q.end(data);
  });
  const verifyOwnership=async()=>{
   verifyBindings();operatorFixture();
   assert.equal(privateJSON(resolve(ui.backendState,'public/instance.json')).instanceId,c.instanceId);
   const q=spawnSync('systemctl',['--user','show',ui.managedUnits.core,'-p','ActiveState','-p','SubState','-p','Restart','-p','NRestarts','-p','RuntimeMaxUSec','-p','ExecStart'],{encoding:'utf8',timeout:5000});assert.equal(q.status,0);
   const props=Object.fromEntries(q.stdout.trim().split('\n').map(x=>{const n=x.indexOf('=');return [x.slice(0,n),x.slice(n+1)];}));assert.equal(props.ActiveState,'active');assert.equal(props.SubState,'running');assert.equal(props.Restart,'no');assert.equal(props.NRestarts,'0');assert.equal(props.RuntimeMaxUSec,'12h');assert.ok(props.ExecStart.includes(resolve(helper.services[0].checkout,'scripts/emulator-fixture-bridge.mjs')));
   const tls=await call('/functions/v1/get-public-config');assert.equal(tls.data.instanceId,c.instanceId);assert.equal(tls.data.canonicalOrigin,c.origin);
   const socket=lstatSync(c.otpSocket);assert.ok(socket.isSocket()&&socket.uid===process.getuid()&&(socket.mode&0o077)===0&&realpathSync(c.otpSocket)===c.otpSocket);
  };
  phase='OWNED_TLS_AND_IPC';await verifyOwnership();phase='READONLY_SQL';const before=bImageSnapshot(c,env);assert.equal(createHash('sha256').update(JSON.stringify(before)).digest('hex'),privateJSON(c.preservationProof).baselineSnapshotSHA256);phase='PRE_OTP_QUOTA_AND_STATE';bImageBefore(c,before); // Quota refusal precedes attempt directory/OTP.
  mkdirSync(c.caseDirectory,{mode:0o700});out=resolve(c.caseDirectory,'b-image-result.json');state={status:'RUNNING',otpAttempted:false,writes:[],phases:[]};
  const record=async event=>{state.phases.push(event);writeFileSync(out,JSON.stringify(state,null,2)+'\n',{mode:0o600});};
  const challenge=phone=>new Promise((done,reject)=>{
   assert.equal(phone,c.adminPhone);verifyBindings();const s=createConnection(c.otpSocket);let buffer='';s.setTimeout(5000);s.on('connect',()=>s.write(JSON.stringify({phone})+'\n'));
   s.on('data',p=>{buffer+=p;if(Buffer.byteLength(buffer)>2048){s.destroy(new Error('Bounded challenge exceeded'));return;}if(buffer.includes('\n')){s.end();try{const code=JSON.parse(buffer).code;assert.match(code,/^\d{6}$/);done(code);}catch{reject(new Error('Owned challenge unavailable'));}}});s.on('error',reject);s.on('timeout',()=>s.destroy(new Error('Owned challenge timeout')));s.on('end',()=>{if(!buffer.includes('\n'))reject(new Error('Incomplete challenge'));});
  });
  const objectTransport=(path,bytes,token)=>new Promise((done,reject)=>{
   verifyBindings();assert.match(path,new RegExp('^headers/'+c.grnId+'/[a-f0-9-]{36}_fixture-b-0109\\.png$'));
   const q=request({hostname:'127.0.0.1',port:18443,servername:'backend-core.example.test',ca,timeout:15000,path:'/storage/v1/object/grn-images/'+path,method:bytes?'POST':'GET',headers:{Host:'backend-core.example.test',apikey:anon,Authorization:'Bearer '+token,...(bytes?{'Content-Type':c.mimeType,'Content-Length':bytes.length,'x-upsert':'false'}:{})}},res=>{
    const chunks=[];let length=0;res.on('data',part=>{length+=part.length;if(length>65536)q.destroy(new Error('Bounded object exceeded'));else chunks.push(part);});res.on('error',reject);res.on('end',()=>{try{assert.equal(res.statusCode,200);done(Buffer.concat(chunks));}catch{reject(new Error('Owned object response refused'));}});
   });q.on('error',()=>reject(new Error('Owned object transport failed')));q.on('timeout',()=>q.destroy(new Error('Owned object timeout')));q.end(bytes);
  });
  const upload=async(path,bytes,token)=>{await objectTransport(path,bytes,token);};
  const readObjectSHA256=async(path,token)=>createHash('sha256').update(await objectTransport(path,undefined,token)).digest('hex');
  const result=await runBImage(c,{verifyOwnership,snapshot:async()=>{verifyBindings();return bImageSnapshot(c,env);},call,challenge,record,image:async()=>{verifyBindings();return readFileSync(c.imageFile);},upload,readObjectSHA256},state);
  writeFileSync(resolve(c.caseDirectory,'b-image-preservation.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});state.status='PASS';await record({phase:'FINAL_IMAGE_PRESERVATION_PASS'});console.log('{"status":"PASS","scope":"ordinary owned B image preparation only"}');
 }
}catch(error){if(state){state.status='FAIL';state.exceptionType=error.name;state.reason='Preserve evidence and uncertain state; no automatic retry or cleanup';writeFileSync(out,JSON.stringify(state,null,2)+'\n',{mode:0o600});}console.error(JSON.stringify({status:'FAIL',category:'B_IMAGE_REFUSED_OR_STOPPED',phase,refusal:error.message?.includes('Ordinary administrator quota exhausted')?'ORDINARY_ADMINISTRATOR_QUOTA_EXHAUSTED':'OWNERSHIP_OR_STATE_REFUSED'}));process.exitCode=1;}
