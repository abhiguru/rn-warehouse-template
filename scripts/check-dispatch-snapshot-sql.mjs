// Explicit SQL-only integration against a newly created, network-disabled scratch
// PostgreSQL container. Never use the installed warehouse or core fixture DB.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dispatchSnapshotSQL, dispatchSnapshotShape } from './fixture-dispatch-snapshot.mjs';
import { writeBaseline, lossEvidence, retryEvidence } from './fixture-write-reconciliation.mjs';
const name = process.argv[2];
assert.match(name ?? '', /^warehouse-sql-adapter-[0-9]{3,8}$/);
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
function docker(args, input) {
  const r = spawnSync('sg', ['docker', '-c', ['docker', ...args].map(quote).join(' ')],
    { input, encoding: 'utf8', timeout: 15000, maxBuffer: 1024*1024 });
  assert.equal(r.status, 0, 'SCRATCH_DOCKER_COMMAND_FAILED');
  return r.stdout;
}
const [container] = JSON.parse(docker(['inspect', name]));
assert.equal(container.Name, '/'+name);
assert.equal(container.Config.Labels['warehouse.exercise'], name.replace('warehouse-', ''));
assert.equal(container.Config.Image, 'supabase/postgres@sha256:0e2279598bc0224fb5960c3a61eb23270cd60119427f3a7bdec86ba282600dcc');
assert.equal(container.Config.User, 'postgres');
assert.equal(container.HostConfig.NetworkMode, 'none');
assert.equal(container.HostConfig.ReadonlyRootfs, true);
assert.ok(!Object.keys(container.HostConfig.PortBindings ?? {}).length);
assert.ok(container.Mounts.every(m => m.Type === 'tmpfs'), 'NO_EXTERNAL_STATE_ALLOWED');
assert.equal(container.State.Running, true);
function sql(q) { return docker(['exec', '-i', name, 'psql', '-h', '/tmp', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], q).trim(); }
assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public';"), '0', 'FRESH_SCRATCH_DATABASE_REQUIRED');
assert.equal(sql('SHOW listen_addresses;'), '', 'NO_TCP_LISTENER_ALLOWED');
// Minimal schema for query compatibility. This is not the application schema or
// a test of its RPCs/RLS/triggers/authentication.
sql(`CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA storage;
CREATE TABLE public.goodsreceived(id uuid,gr_no text,deleted_at timestamptz);
CREATE TABLE public.goodsreceived_trl(id uuid,gr_id uuid,qty integer,stock integer,package_mark text);
CREATE TABLE public.dispatch(id uuid,disp_no text);
CREATE TABLE public.dispatch_trl(id uuid,disp_id uuid,gr_trl_id uuid,disp_qty integer);
CREATE TABLE public.idempotency_keys(id uuid,idempotency_key text,rpc_function text,response jsonb);
CREATE TABLE public.invoice(id uuid,notes text);
CREATE TABLE public.invoice_trl(id uuid);
CREATE TABLE public.orders(id uuid);
CREATE TABLE public.order_items(id uuid);
CREATE TABLE public.auto_invoice_errors(id uuid);
CREATE TABLE storage.objects(id uuid);
INSERT INTO public.goodsreceived VALUES ('11111111-1111-4111-8111-111111111111','FXF900',NULL);
INSERT INTO public.goodsreceived_trl VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',10,10,'TEST');`);
const c = { scope:'isolated-fictional-dispatch-observation',kind:'dispatch',record:'FXF901',sourceReceipt:'FXF900',
  instanceId:'33333333-3333-4333-8333-333333333333',stockLineId:'22222222-2222-4222-8222-222222222222',
  quantity:2,sourceQuantity:10,sourcePackageMark:'TEST',phase:'before-upstream',artifactSHA256:'a'.repeat(64),fixtureGuardSHA256:'b'.repeat(64) };
const key = 'warehouse-dispatch-'+'c'.repeat(64);
const snapshot = operationKey => JSON.parse(sql(dispatchSnapshotSQL(c, operationKey)));
const before = snapshot(null); dispatchSnapshotShape(c,before,true); writeBaseline(c,before);
const fault = { record:c.record,path:'/rest/v1/rpc/create_dispatch_with_stock_check',key,state:'DROPPED_BEFORE_UPSTREAM' };
const loss = { artifactSHA256:c.artifactSHA256,fault,nativeError:true,requestObservations:{observations:[],overflow:false},snapshot:snapshot(key) };
// Native booleans here are deliberately synthetic predicate inputs, never device evidence.
lossEvidence(c,before,loss);
sql(`INSERT INTO public.dispatch VALUES ('44444444-4444-4444-8444-444444444444','FXF901');
INSERT INTO public.dispatch_trl VALUES ('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',2);
UPDATE public.goodsreceived_trl SET stock=8 WHERE id='22222222-2222-4222-8222-222222222222';
INSERT INTO public.idempotency_keys VALUES ('66666666-6666-4666-8666-666666666666','${key}','create_dispatch_with_stock_check','{"success":true,"dispatch_id":"44444444-4444-4444-8444-444444444444"}');`);
const saved = snapshot(key); dispatchSnapshotShape(c,saved);
const retry = { artifactSHA256:c.artifactSHA256,nativeSuccess:true,unchangedForm:true,snapshot:saved,
  requestObservations:{overflow:false,observations:[{sequence:1,path:fault.path,record:c.record,stateWhenObserved:fault.state,key,sameKey:true}]} };
retryEvidence(c,before,loss,retry);
const afterCase = {...c,phase:'after-upstream-success'};
const afterLoss = {...loss,fault:{...fault,state:'DROPPED_AFTER_UPSTREAM_SUCCESS'},snapshot:saved};
const afterRetry = {...retry,requestObservations:{overflow:false,observations:[{...retry.requestObservations.observations[0],stateWhenObserved:afterLoss.fault.state}]}};
retryEvidence(afterCase,before,afterLoss,afterRetry);
assert.throws(() => writeBaseline(c,saved),/RECORD_ALREADY_USED/);
sql('UPDATE public.goodsreceived_trl SET stock=6;');
assert.throws(() => retryEvidence(c,before,loss,{...retry,snapshot:snapshot(key)}),/STOCK_MISMATCH/);
sql('UPDATE public.goodsreceived_trl SET stock=8; INSERT INTO public.idempotency_keys SELECT * FROM public.idempotency_keys;');
assert.throws(() => retryEvidence(c,before,loss,{...retry,snapshot:snapshot(key)}),/EXACTLY_ONE_CACHED_RESULT/);
sql(`DELETE FROM public.idempotency_keys WHERE ctid IN (SELECT ctid FROM public.idempotency_keys LIMIT 1);
INSERT INTO public.orders VALUES ('77777777-7777-4777-8777-777777777777');`);
assert.throws(() => retryEvidence(c,before,loss,{...retry,snapshot:snapshot(key)}),/UNRELATED_BUSINESS_CHANGED/);
sql(`DELETE FROM public.orders; UPDATE public.dispatch_trl SET gr_trl_id='88888888-8888-4888-8888-888888888888';`);
assert.throws(() => dispatchSnapshotShape(c,snapshot(key)),/WRONG_STOCK_LINE/);
console.log(JSON.stringify({status:'PASS',scope:'scratch SQL compatibility and synthetic reconciliation only',checks:['baseline','before-loss','before-retry','after-retry','occupied-record','duplicate-stock-change','duplicate-cache','unrelated-business-change','wrong-stock-line'],
  native:false,rpc:false,rls:false,warehouseAccess:false}));
