// Optional owned-fixture observer. No authentication, native or business mutation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {privateJSON,assertReleased} from './fixture-session-guards.mjs';
import {confirmedDraftConfig,confirmedDraftBefore,confirmedDraftReconcile,confirmedHelperWindow} from './fixture-confirmed-draft-controls.mjs';
import {verifyManagedHelpers} from './fixture-service-health.mjs';
import {confirmedOrdersSwitchTimeline} from './fixture-confirmed-orders-switch-controls.mjs';
import {confirmedDraftSnapshot} from './fixture-confirmed-draft-snapshot.mjs';
process.umask(0o077);
const digest=b=>createHash('sha256').update(b).digest('hex');
export const confirmedDraftTooling=[
 'fixture-confirmed-orders-switch-controls.mjs',
 'fixture-confirmed-draft-observe.mjs','fixture-confirmed-draft-controls.mjs','fixture-confirmed-draft-snapshot.mjs',
 'fixture-queue-processing-snapshot.mjs','fixture-queue-processing-controls.mjs','fixture-session-guards.mjs','fixture-service-health.mjs',
 'fixture-ui/confirmed-draft-api30.py','fixture-ui/confirmed_draft_controls.py','fixture-ui/navigation-api30.py',
 'fixture-ui/navigation_controls.py','fixture-ui/soak-api30.py','fixture-ui/dispatch_case_controls.py',
 'fixture-ui/fixture_observation.py','fixture-ui/emulator_offline_network.py','fixture-ui/selection_start_controls.py',
 'fixture-ui/unsaved_customer_controls.py','fixture-ui/unsaved_grn_controls.py','fixture-ui/unsaved_invoice_controls.py',
 'fixture-ui/unsaved_dispatch_controls.py',
];
function privateLog(path){
 const s=lstatSync(path);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o077)===0&&s.size<=8388608);
 assert.equal(realpathSync(path),resolve(path));return {bytes:readFileSync(path),inode:s.ino};
}
try{
 const [path,phase]=process.argv.slice(2);assert.ok(['guard','before','after'].includes(phase));
 const c=confirmedDraftConfig(privateJSON(path));assertReleased(c);
 assert.ok(Date.now()<Date.parse(c.deadlineUTC)&&Date.parse(c.deadlineUTC)-Date.now()<=600000,'BOUNDED_FRESH_CASE_REQUIRED');
 const scripts=resolve(new URL('.',import.meta.url).pathname);
 assert.deepEqual(Object.keys(c.toolingSHA256).sort(),[...confirmedDraftTooling].sort());
 for(const name of confirmedDraftTooling)assert.equal(digest(readFileSync(resolve(scripts,name))),c.toolingSHA256[name],'FROZEN_TOOLING_CHANGED');
 assert.equal(digest(readFileSync(c.soakConfig)),c.soakConfigSHA256);
 const returning=c.confirmedDraftSwitchBack===true;const ui=privateJSON(c.soakConfig);assert.equal(ui.apkSHA256,c.artifactSHA256);
 verifyManagedHelpers(ui.managedUnits);
 const uptime=Number(readFileSync('/proc/uptime','utf8').split(' ')[0]);
 for(const unit of Object.values(ui.managedUnits)){
  const r=spawnSync('systemctl',['--user','show',unit,'--property=RuntimeMaxUSec,ActiveEnterTimestampMonotonic'],{encoding:'utf8',timeout:5000,maxBuffer:16384});assert.equal(r.status,0);
  confirmedHelperWindow(Object.fromEntries(r.stdout.trim().split('\n').map(s=>s.split('='))),uptime,(Date.parse(c.deadlineUTC)-Date.now())/1000);
 }
 for(const [a,b] of [['backendCheckout','backendCheckout'],['backendState','backendState'],['targetBackendCheckout','secondaryBackendCheckout'],['targetBackendState','secondaryBackendState']])assert.equal(c[a],ui[returning?({backendCheckout:'secondaryBackendCheckout',backendState:'secondaryBackendState',secondaryBackendCheckout:'backendCheckout',secondaryBackendState:'backendState'}[b]):b]);
 for(const side of ['source','destination']){
  const h=privateJSON(c[side+'HelperConfig']);assert.equal(digest(readFileSync(c[side+'HelperConfig'])),c[side+'HelperConfigSHA256']);
  assert.equal(h.scope,'isolated-fictional-fixture');assert.equal(h.services.length,1);
  const service=h.services[0],source=side==='source';assert.equal(service.kind,(source!==returning)?'core':'switch');assert.equal(service.observeAuthenticationPresence,true);
  if(source&&c.confirmedOrdersResponseSwitch===true){assert.equal(service.confirmedOrdersReadDelayMs,30000);assert.equal(digest(readFileSync(resolve(service.checkout,'scripts/fixture-confirmed-orders-delay.mjs'))),c.confirmedReadControlSHA256);}else assert.equal(service.confirmedOrdersReadDelayMs??0,0);
  assert.equal(service.state,c[source?'backendState':'targetBackendState']);assert.equal(service.owningCheckout,c[source?'backendCheckout':'targetBackendCheckout']);
  assert.equal(service.ownerGuardSHA256,c[source?'fixtureGuardSHA256':'targetFixtureGuardSHA256']);
  assert.equal(c[side+'HTTPLog'],resolve(h.logDir,`warehouse-fixture-${service.kind}-${h.runId}.service.log`));
  assert.equal(ui.managedUnits[service.kind],`warehouse-fixture-${service.kind}-${h.runId}.service`);
  privateLog(c[side+'HTTPLog']);
 }
 const guards=[resolve(c.backendCheckout,returning?'scripts/switch-fixture-common.mjs':'tests/operator-fixture.mjs'),resolve(c.targetBackendCheckout,returning?'tests/operator-fixture.mjs':'scripts/switch-fixture-common.mjs')];
 for(const [guard,sha] of [[guards[0],c.fixtureGuardSHA256],[guards[1],c.targetFixtureGuardSHA256]])assert.equal(digest(readFileSync(guard)),sha);
 for(const [state,id] of [[c.backendState,c.instanceId],[c.targetBackendState,c.targetInstanceId]])assert.equal(JSON.parse(readFileSync(resolve(state,'public/instance.json'))).instanceId,id);
 if(phase!=='guard'){
  const st=lstatSync(c.caseDirectory);assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(st.mode&0o777)===0o700);assert.equal(realpathSync(c.caseDirectory),resolve(c.caseDirectory));
  process.env.WAREHOUSE_STATE_DIR=c.backendState;const sourceModule=await import(pathToFileURL(guards[0]));const source=(returning?sourceModule.switchingFixture():sourceModule.operatorFixture()).env;
  process.env.WAREHOUSE_STATE_DIR=c.targetBackendState;const destinationModule=await import(pathToFileURL(guards[1]));const destination=(returning?destinationModule.operatorFixture():destinationModule.switchingFixture()).env;
  const snapshot={source:confirmedDraftSnapshot(c,'source',source),destination:confirmedDraftSnapshot(c,'destination',destination)};
  if(phase==='before'){
   confirmedDraftBefore(c,snapshot);const logs={};
   for(const side of ['source','destination']){const l=privateLog(c[side+'HTTPLog']);logs[side]={inode:l.inode,offset:l.bytes.length,prefixSHA256:digest(l.bytes)};}
   writeFileSync(resolve(c.caseDirectory,'confirmed-before.json'),JSON.stringify({configSHA256:digest(readFileSync(path)),snapshot,logs}),{flag:'wx',mode:0o600});
  }else{
   const before=privateJSON(resolve(c.caseDirectory,'confirmed-before.json'));assert.equal(before.configSHA256,digest(readFileSync(path)));
   const native=privateJSON(resolve(c.caseDirectory,'confirmed-native-result.json'));const events={};
   for(const side of ['source','destination']){
    const l=privateLog(c[side+'HTTPLog']),old=before.logs[side];assert.equal(l.inode,old.inode);assert.ok(l.bytes.length>=old.offset);assert.equal(digest(l.bytes.subarray(0,old.offset)),old.prefixSHA256,'HTTP_EVIDENCE_REPLACED');
    const tail=l.bytes.subarray(old.offset).toString();assert.ok(!tail||tail.endsWith('\n'),'HTTP_EVENT_STILL_PENDING');
    events[side]=tail.split('\n').filter(Boolean).map(line=>{const e=JSON.parse(line);assert.ok([...(c.confirmedOrdersResponseSwitch===true?['confirmed-orders-delay-start']:[]),'complete','upgrade-request','client-response-closed','client-request-aborted','upstream-unavailable','client-request-error','upstream-timeout','upstream-response-aborted','upstream-response-error'].includes(e.event));assert.equal(typeof e.authorizationPresent,'boolean');assert.equal(typeof e.credentialQueryPresent,'boolean');return e;});
   }
   const logout=events.source.filter(e=>e.path==='/rest/v1/rpc/logout_session');assert.equal(logout.length,1,'ONE_INDEPENDENT_LOGOUT_REQUIRED');assert.equal(logout[0].event,'complete');assert.equal(logout[0].method,'POST');
   const observed={...native,sourceLogoutCompletions:logout.length,sourceLogoutStatus:logout[0].status,destinationAuthenticatedRequests:events.destination.filter(e=>e.authorizationPresent||e.credentialQueryPresent).length};
   const result=confirmedDraftReconcile(c,before.snapshot,snapshot,observed);
   if(c.confirmedOrdersResponseSwitch===true)result.ordersSwitch=confirmedOrdersSwitchTimeline(c,native,events.source);
   writeFileSync(resolve(c.caseDirectory,'confirmed-after.json'),JSON.stringify({configSHA256:before.configSHA256,result,snapshot,events}),{flag:'wx',mode:0o600});
  }
 }
 console.log(JSON.stringify({status:'PASS',phase,scope:'confirmed-switch-pre-authentication-observation-only'}));
}catch{console.error(JSON.stringify({status:'FAIL',category:'CONFIRMED_DRAFT_OBSERVATION_REFUSED'}));process.exitCode=1;}
