// Explicit full-schema SQL compatibility check. Never target a warehouse DB.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { realpathSync, lstatSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dispatchSnapshotSQL, dispatchSnapshotShape } from './fixture-dispatch-snapshot.mjs';
import { navigationSnapshotSQL, navigationBefore } from './fixture-navigation-guards.mjs';

export const scratchImage = 'supabase/postgres@sha256:0e2279598bc0224fb5960c3a61eb23270cd60119427f3a7bdec86ba282600dcc';
export function scratchIsolation(name, c) {
  assert.match(name ?? '', /^warehouse-schema-observer-[0-9]{3,8}$/);
  assert.equal(c.Name, '/'+name);
  assert.equal(c.Config.Labels?.['warehouse.exercise'], name.replace('warehouse-', ''));
  assert.equal(c.Config.Image, scratchImage);
  assert.equal(c.HostConfig.NetworkMode, 'none');
  assert.ok(!Object.keys(c.HostConfig.PortBindings ?? {}).length, 'NO_HOST_PORTS_ALLOWED');
  assert.equal(c.HostConfig.Privileged, false);
  assert.equal(c.HostConfig.RestartPolicy.Name, 'no');
  assert.equal(c.HostConfig.Memory, 1073741824);
  assert.equal(c.HostConfig.NanoCpus, 1000000000);
  assert.ok(c.Mounts.every(m => m.Type === 'tmpfs'), 'NO_EXTERNAL_STATE_ALLOWED');
  assert.equal(c.HostConfig.Tmpfs?.['/var/lib/postgresql/data'], 'rw,size=768m');
  assert.equal(c.State.Running, true);
}

export async function checkSchema(name, backend, evidence) {
  assert.match(name ?? '', /^warehouse-schema-observer-[0-9]{3,8}$/);
  assert.ok(isAbsolute(evidence) && realpathSync(evidence) === resolve(evidence));
  const es=lstatSync(evidence);
  assert.ok(es.isDirectory() && es.uid===process.getuid() && (es.mode & 0o777)===0o700);
  let commandIndex=0;
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  function docker(args, input, password, timeout=20000) {
    // Reserve evidence before the command; a used directory cannot replay it.
    const fd=openSync(resolve(evidence,`command-${++commandIndex}.json`),'wx',0o600);
    const r = spawnSync('sg', ['docker', '-c', ['docker', ...args].map(quote).join(' ')], {
      input, encoding:'utf8', timeout, maxBuffer:16*1024*1024,
      env: password ? {...process.env,PGPASSWORD:password} : process.env,
    });
    // Raw scratch command output is private. It is never echoed to the caller.
    try {writeFileSync(fd,JSON.stringify({status:r.status,stdout:r.stdout,stderr:r.stderr}));}
    finally {closeSync(fd);}
    assert.equal(r.status, 0, 'SCRATCH_COMMAND_FAILED; preserve private command logs');
    return r.stdout.trim();
  }
  const [container] = JSON.parse(docker(['inspect',name]));
  scratchIsolation(name,container);
  assert.ok(isAbsolute(backend) && realpathSync(backend) === resolve(backend));
  const git = args => {
    const r = spawnSync('git',args,{cwd:backend,encoding:'utf8',timeout:10000});
    assert.equal(r.status,0);return r.stdout.trim();
  };
  assert.equal(git(['status','--porcelain']),'','CLEAN_BACKEND_SOURCE_REQUIRED');
  const backendCommit=git(['rev-parse','HEAD']);
  assert.equal(backendCommit,'bed4eeee4a008073aa453c32da27cade50a32a2f');
  const env=Object.fromEntries(container.Config.Env.map(line => {
    const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)];
  }));
  assert.equal(env.AUTH_MODE,'operator');assert.equal(env.APP_ENV,'production');
  assert.ok(typeof env.POSTGRES_PASSWORD === 'string' && env.POSTGRES_PASSWORD.length >= 32);
  function sql(query, timeout) {
    return docker(['exec','-i','-e','PGPASSWORD',name,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],
      query,env.POSTGRES_PASSWORD,timeout);
  }
  assert.equal(sql("SELECT to_regclass('public.user_profiles') IS NULL AND to_regclass('warehouse_migrations.applied') IS NULL;"),'t',
    'FRESH_SCRATCH_DATABASE_REQUIRED');
  // Import only after isolation/empty-schema/clean-source checks. This plan is
  // the repository's unmodified complete migration sequence, not a copied DB.
  const {migrationPlan}=await import(pathToFileURL(resolve(backend,'scripts/migration-plan.mjs')).href);
  sql(migrationPlan(backend),180000);
  const count=Number(sql('SELECT count(*) FROM warehouse_migrations.applied;'));
  assert.ok(Number.isSafeInteger(count) && count > 0);
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const dispatch={scope:'isolated-fictional-dispatch-observation',kind:'dispatch',record:'FXF9901',sourceReceipt:'FXF9900',
    instanceId:id(1),stockLineId:id(2),quantity:1,sourceQuantity:2,sourcePackageMark:'',phase:'before-upstream',
    artifactSHA256:'a'.repeat(64),fixtureGuardSHA256:'b'.repeat(64)};
  const empty=JSON.parse(sql(dispatchSnapshotSQL(dispatch)));
  const keyed=JSON.parse(sql(dispatchSnapshotSQL(dispatch,'warehouse-dispatch-'+'c'.repeat(64))));
  assert.deepEqual(keyed,empty);
  assert.deepEqual(empty.headerIds,[]);assert.deepEqual(empty.lineIds,[]);
  assert.equal(empty.cacheCount,0);assert.equal(empty.sourceBound,false);assert.equal(empty.stock,null);
  assert.match(empty.unrelatedBusinessHash,/^[a-f0-9]{64}$/);
  assert.throws(()=>dispatchSnapshotShape(dispatch,empty,true),/RESERVED_SOURCE_NOT_BOUND/);
  const nav={scope:'isolated-fictional-navigation-case',case:'same-server',backendCheckout:backend,
    backendState:'/unused/core-backend-test-657',soakConfig:'/unused/ui.json',artifactAudit:'/unused/audit.json',
    caseDirectory:'/unused/new',instanceId:id(1),profileId:id(3),sessionId:id(4),profileName:'Core Demo Administrator',
    artifactSHA256:'a'.repeat(64),fixtureGuardSHA256:'b'.repeat(64)};
  const first=JSON.parse(sql(navigationSnapshotSQL(nav)));
  const second=JSON.parse(sql(navigationSnapshotSQL(nav)));
  assert.deepEqual(second,first);assert.equal(first.profile,null);assert.equal(first.nativeSessionPresent,false);
  assert.equal(first.otpCount,0);
  for(const key of ['businessHash','otherAuthHash']) assert.match(first[key],/^[a-f0-9]{64}$/);
  assert.throws(()=>navigationBefore(nav,first));
  assert.equal(Number(sql('SELECT count(*) FROM warehouse_migrations.applied;')),count);
  return {status:'PASS',scope:'complete migrated schema; empty-fixture observer SQL compatibility only',backendCommit,
    migrationCount:count,checks:['dispatch-no-key','dispatch-with-key','missing-stock-refused','navigation-repeat-stable','missing-session-refused'],
    native:false,rpc:false,rls:false,warehouseAccess:false,sessionIssued:false};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {console.log(JSON.stringify(await checkSchema(...process.argv.slice(2))));}
  catch {console.error(JSON.stringify({status:'FAIL',category:'SCRATCH_SCHEMA_CHECK_FAILED; preserve evidence; do not reuse state'}));process.exitCode=1;}
}
