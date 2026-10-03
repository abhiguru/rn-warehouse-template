import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { privateJSON, assertReleased } from './fixture-session-guards.mjs';
import { qrConfig, qrPreservationSQL } from './fixture-qr-controls.mjs';

process.umask(0o077);
try {
  const [path, phase] = process.argv.slice(2);
  assert.ok(['guard','before','after','failure'].includes(phase));
  const c = qrConfig(privateJSON(path)); assertReleased(c);
  const ui = privateJSON(c.soakConfig);
  const inputs=privateJSON(ui.emulatorInputs);
  assert.equal(inputs.createdOnlyForUnattendedFixtures,true);
  assert.equal(inputs.avd,'TestWarehouseFixture_API30');assert.equal(inputs.serial,'emulator-5556');
  assert.equal(ui.apkSHA256,c.artifactSHA256);
  const manifest=privateJSON(resolve(ui.backendState,'public/instance.json'));
  assert.equal(manifest.instanceId,c.instanceId);assert.equal(manifest.canonicalOrigin,c.origin);
  assert.equal(manifest.displayName,c.displayName);
  const prepared=privateJSON(c.cameraPreparation),owner=privateJSON(c.cameraOwnerProof);
  assert.equal(prepared.origin,c.origin);assert.equal(prepared.assetSHA256,c.assetSHA256);
  assert.equal(owner.status,'PASS');assert.equal(owner.unit,inputs.emulatorSupervisor);
  assert.equal(owner.cameraMode,prepared.plannedLaunchMode);
  assert.equal(owner.artifactSHA256,c.artifactSHA256);
  const image=owner.cameraMode.slice('imagefile:'.length);
  assert.ok(owner.cameraMode.startsWith('imagefile:'));
  assert.equal(createHash('sha256').update(readFileSync(image)).digest('hex'),c.assetSHA256);
  const shown=spawnSync('systemctl',['--user','show',owner.unit,'-p','ExecStart,ActiveState,Restart,NRestarts,KillMode'],{encoding:'utf8',timeout:10000});
  assert.equal(shown.status,0);assert.ok(shown.stdout.includes('-camera-back '+owner.cameraMode));
  for (const value of ['ActiveState=active','Restart=no','NRestarts=0','KillMode=control-group']) assert.ok(shown.stdout.includes(value));
  const guard=resolve(ui.backendCheckout,'tests/operator-fixture.mjs');
  assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'),c.fixtureGuardSHA256);
  process.env.WAREHOUSE_STATE_DIR=ui.backendState;
  const {operatorFixture}=await import(pathToFileURL(guard).href),{env}=operatorFixture();
  const query=(sql)=>{
    const q=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:25000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});
    assert.equal(q.status,0,'PRIVATE_QR_SQL_FAILED');return JSON.parse(q.stdout);
  };
  if (phase!=='guard') {
    const e=resolve(c.caseDirectory),st=lstatSync(e);
    assert.ok(st.isDirectory()&&st.uid===process.getuid()&&(st.mode&0o077)===0&&realpathSync(e)===e);
    const tables=query("BEGIN TRANSACTION READ ONLY;SET LOCAL statement_timeout='10s';SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename) ORDER BY schemaname,tablename) FROM pg_catalog.pg_tables WHERE schemaname IN ('public','warehouse_security','storage','auth');COMMIT;");
    const hashes=query(qrPreservationSQL(tables));
    if (phase!=='before') assert.deepEqual(hashes,privateJSON(resolve(e,'qr-before.json')).hashes,'QR_CHANGED_PRESERVED_STATE');
    writeFileSync(resolve(e,'qr-'+phase+'.json'),JSON.stringify({status:'PASS',phase,relations:tables.length,hashes},null,2)+'\n',{flag:'wx',mode:0o600});
  }
  console.log(JSON.stringify({status:'PASS',phase,scope:'synthetic-qr-preservation'}));
} catch {
  console.error(JSON.stringify({status:'FAIL',category:'QR_OBSERVATION_REFUSED'}));process.exitCode=1;
}
