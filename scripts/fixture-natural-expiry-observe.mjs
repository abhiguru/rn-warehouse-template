// Read-only owned SQL and filesystem gates for the dedicated expiry executor.
import assert from 'node:assert/strict';
import {createHash,X509Certificate} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync,writeFileSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {privateJSON,assertReleased} from './fixture-session-guards.mjs';
import {naturalExpiryAppointment,naturalExpiryExecution} from './fixture-natural-expiry-controls.mjs';
import {naturalExpirySnapshot,naturalExpiryAfter} from './fixture-natural-expiry-snapshot.mjs';
import {isMain} from './is-main.mjs';
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
export async function observeNaturalExpiry(path,phase){
 assert.ok(['guard','before','after'].includes(phase));
 const c=privateJSON(path);assertReleased(c);
 assert.equal(c.scope,'isolated-fictional-dedicated-natural-expiry');
 for(const key of ['backendCheckout','backendState','certificate','artifact','caseDirectory','preparationProof'])assert.ok(isAbsolute(c[key]));
 assert.ok(Array.isArray(c.bindings)&&c.bindings.length>0&&c.bindings.length<=256);
 for(const b of c.bindings){assert.ok(isAbsolute(b.path));assert.match(b.sha256,/^[a-f0-9]{64}$/);const st=lstatSync(b.path);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.uid===process.getuid());assert.equal(realpathSync(b.path),resolve(b.path));assert.equal(sha(b.path),b.sha256,'Expiry binding changed');}
 const boundPaths=new Set(c.bindings.map(b=>b.path));
 for(const p of [c.preparationProof,c.artifact,c.certificate,resolve(c.backendCheckout,'tests/operator-fixture.mjs'),resolve(c.backendState,'public/instance.json'),resolve(c.backendState,'config/compose.env')])assert.ok(boundPaths.has(p),'Required expiry input unbound');
 const proof=privateJSON(c.preparationProof),appointment=naturalExpiryAppointment(c,proof);
 assert.deepEqual(c.appointment,appointment,'Recorded appointment changed');
 assert.equal(sha(c.artifact),c.artifactSHA256);
 const cert=new X509Certificate(readFileSync(c.certificate));assert.equal(cert.checkHost('backend-core.example.test'),'backend-core.example.test');assert.equal(cert.ca,true);
 const guard=resolve(c.backendCheckout,'tests/operator-fixture.mjs');assert.equal(sha(guard),c.fixtureGuardSHA256);
 process.env.WAREHOUSE_STATE_DIR=c.backendState;const {operatorFixture}=await import(pathToFileURL(guard).href);const fixture=operatorFixture();assert.equal(JSON.parse(readFileSync(resolve(c.backendState,'public/instance.json'),'utf8')).instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
 const snapshot=naturalExpirySnapshot(c,fixture.env);
 naturalExpiryExecution(appointment,{serverNowUTC:snapshot.serverNowUTC,session:snapshot.session,certificateExpiresAtUTC:cert.validTo,ownershipMatches:true,competingRun:false,artifactMatches:true,bindingsMatch:true});
 if(phase!=='guard'){
  const st=lstatSync(c.caseDirectory);assert.ok(st.isDirectory()&&st.uid===process.getuid()&&(st.mode&0o777)===0o700);assert.equal(realpathSync(c.caseDirectory),resolve(c.caseDirectory));
  if(phase==='after')naturalExpiryAfter(c,privateJSON(resolve(c.caseDirectory,'expiry-before.json')).snapshot,snapshot,privateJSON(resolve(c.caseDirectory,'native-result.json')));
  writeFileSync(resolve(c.caseDirectory,'expiry-'+phase+'.json'),JSON.stringify({status:'PASS',phase,snapshot}),{flag:'wx',mode:0o600});
 }
 return {status:'PASS',phase,scope:'owned readonly natural expiry gates'};
}
if(isMain(import.meta.url))observeNaturalExpiry(process.argv[2],process.argv[3]).then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('{"status":"BLOCKED","category":"NATURAL_EXPIRY_GATE_REFUSED","automaticRetry":false}');process.exitCode=2;});
