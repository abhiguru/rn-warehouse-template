// Actual one-shot adapter. Invoked only by the actor-lock owning Python launcher.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,lstatSync,fstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {createHash,X509Certificate} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {privateJSON,assertReleased} from './fixture-session-guards.mjs';
import {naturalExpiryScheduleSpec,installNaturalExpirySchedule} from './fixture-natural-expiry-schedule.mjs';
import {naturalExpirySnapshot} from './fixture-natural-expiry-snapshot.mjs';
process.umask(0o077);
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function command(p,args){const q=spawnSync(p,args,{encoding:'utf8',timeout:20000,maxBuffer:1048576,env:{...process.env,TZ:'UTC'}});assert.equal(q.status,0,'Owned scheduler command refused');return q.stdout.trim();}
try{
 const [path,mode]=process.argv.slice(2);assert.ok(['guard','schedule'].includes(mode));const c=privateJSON(path);assertReleased(c);
 const native=privateJSON(c.configuration),proof=privateJSON(native.preparationProof);assert.equal(native.scope,c.scope);assert.equal(native.artifactSHA256,c.artifactSHA256);assert.equal(native.sessionId,c.sessionId);
 const required=['fixture-natural-expiry-scheduler.mjs','fixture-natural-expiry-schedule.mjs','fixture-natural-expiry-controls.mjs','fixture-natural-expiry-snapshot.mjs','fixture-session-guards.mjs','is-main.mjs','fixture-natural-expiry-observe.mjs','fixture-ui/natural-expiry-api30.py','fixture-ui/natural-expiry-schedule.py'];for(const n of required)assert.match(native.toolingSHA256[n],/^[a-f0-9]{64}$/);
 const scriptRoot=dirname(dirname(c.executor));for(const [name,expected] of Object.entries(native.toolingSHA256))assert.equal(hash(resolve(scriptRoot,name)),expected);
 assert.equal(hash(c.executor),c.executorSHA256);assert.equal(hash(c.configuration),c.configurationSHA256);
 const directory=lstatSync(dirname(c.log));assert.ok(directory.isDirectory()&&!directory.isSymbolicLink()&&directory.uid===process.getuid()&&(directory.mode&0o077)===0);
 assert.ok(Array.isArray(native.bindings)&&native.bindings.length>0&&native.bindings.length<=256);for(const b of native.bindings)assert.equal(hash(b.path),b.sha256,'Native input changed');const bound=new Set(native.bindings.map(b=>b.path));for(const p of [native.preparationProof,native.artifact,native.certificate,resolve(native.backendState,'config/compose.env'),resolve(native.backendState,'public/instance.json'),resolve(native.backendCheckout,'tests/operator-fixture.mjs')])assert.ok(bound.has(p));
 const guard=resolve(native.backendCheckout,'tests/operator-fixture.mjs');assert.equal(hash(guard),native.fixtureGuardSHA256);process.env.WAREHOUSE_STATE_DIR=native.backendState;const {operatorFixture}=await import(pathToFileURL(guard).href);const fixture=operatorFixture();const snapshot=naturalExpirySnapshot(native,fixture.env);
 assert.equal(snapshot.session.id,c.sessionId);assert.equal(snapshot.session.expired,false);assert.equal(Date.parse(snapshot.session.expiresAtUTC),Date.parse(proof.session.expiresAtUTC));
 const cert=new X509Certificate(readFileSync(native.certificate));assert.equal(cert.checkHost('backend-core.example.test'),'backend-core.example.test');assert.equal(Date.parse(cert.validTo),Date.parse(proof.certificateExpiresAtUTC));assert.equal(hash(native.artifact),c.artifactSHA256);
 const props=Object.fromEntries(command('systemctl',['--user','show',native.emulatorUnit,'-p','ActiveState','-p','Restart','-p','NRestarts','-p','FragmentPath']).split('\n').map(x=>x.split('=')));assert.equal(props.ActiveState,'inactive');assert.equal(props.Restart,'no');assert.equal(props.NRestarts,'0');assert.equal(hash(props.FragmentPath),native.emulatorUnitSHA256);
 const base='warehouse-fixture-natural-expiry-'+c.runId,unitDirectory=resolve(homedir(),'.config/systemd/user');const unitDir=lstatSync(unitDirectory);assert.ok(unitDir.isDirectory()&&!unitDir.isSymbolicLink()&&unitDir.uid===process.getuid());
 const spec=naturalExpiryScheduleSpec(c,proof,{executorSHA256:hash(c.executor),configurationSHA256:hash(c.configuration),privateOwnedPaths:true,bindingsMatch:true,existingUnit:['service','timer'].some(x=>existsSync(resolve(unitDirectory,base+'.'+x))||command('systemctl',['--user','show',base+'.'+x,'-p','LoadState','--value'])!=='not-found'),existingLog:existsSync(c.log),competingRun:false,nowUTC:snapshot.serverNowUTC});
 if(mode==='guard')console.log('{"status":"PASS","scope":"real expiry scheduling prerequisites only"}');
 else{
  const fd=Number(process.env.WAREHOUSE_EXPIRY_SCHEDULER_ACTOR_FD);assert.ok(Number.isSafeInteger(fd)&&fd>=3);const a=lstatSync(native.actorLock),b=fstatSync(fd);assert.ok(a.isFile()&&!a.isSymbolicLink()&&a.uid===process.getuid()&&(a.mode&0o077)===0&&a.ino===b.ino&&a.dev===b.dev&&realpathSync(native.actorLock)===native.actorLock);const locked=spawnSync('/usr/bin/flock',['--nonblock','3'],{stdio:['ignore','pipe','pipe',fd],timeout:5000});assert.equal(locked.status,0);
  const result=installNaturalExpirySchedule(spec,{
   createPrivateExclusive:(name,text)=>writeFileSync(resolve(unitDirectory,name),text,{flag:'wx',mode:0o600}),
   createPrivateLogExclusive:()=>writeFileSync(c.log,'',{flag:'wx',mode:0o600}),
   verifyUnits:names=>command('systemd-analyze',['--user','verify',...names.map(n=>resolve(unitDirectory,n))]),
   daemonReload:()=>command('systemctl',['--user','daemon-reload']),startTimer:name=>command('systemctl',['--user','start',name]),
   timerState:name=>{const p=Object.fromEntries(command('systemctl',['--user','--timestamp=us','show',name,'-p','ActiveState','-p','SubState','-p','NextElapseUSecRealtime']).split('\n').map(x=>x.split('=')));return {active:p.ActiveState==='active',waiting:p.SubState==='waiting',nextElapseUTC:command('/usr/bin/date',['-u','-d',p.NextElapseUSecRealtime,'+%Y-%m-%dT%H:%M:%S.%3NZ'])};}
  });writeFileSync(c.result,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));
 }
}catch{console.error('{"status":"BLOCKED","category":"NATURAL_EXPIRY_SCHEDULING_REFUSED","automaticRetry":false}');process.exitCode=2;}
