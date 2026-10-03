import test from 'node:test';
import assert from 'node:assert/strict';
import { qrConfig, qrPreservationSQL } from './fixture-qr-controls.mjs';

test('QR admission binds primary fictional identity and refuses activation or authentication', () => {
  const c = { scope:'isolated-fictional-synthetic-qr',origin:'https://backend-core.example.test',displayName:'Fictional Core Warehouse',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',expectedSelectionChange:false,expectedOTPs:0 };
  for (const k of ['soakConfig','caseDirectory','cameraPreparation','cameraOwnerProof']) c[k]='/private/'+k;
  for (const k of ['fixtureGuardSHA256','assetSHA256','artifactSHA256']) c[k]='a'.repeat(64);
  assert.equal(qrConfig(c),c);
  for (const edit of [{origin:'https://production.example.com'},{instanceId:'7ce7a92f-9abf-476a-bd05-a967fac15124'},{expectedSelectionChange:true},{expectedOTPs:1},{cameraOwnerProof:'relative'},{assetSHA256:'wrong'}])
    assert.throws(()=>qrConfig({...c,...edit}));
});

test('full preservation SQL is read-only, digest-only and refuses identifier injection', () => {
  const sql=qrPreservationSQL([{schema:'public',table:'goodsreceived'},{schema:'warehouse_security',table:'refresh_sessions'}]);
  assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/digest/);assert.match(sql,/FROM warehouse_security.refresh_sessions/);
  assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|CREATE|DROP)\b/);
  for (const tables of [[],[{schema:'pg_catalog',table:'pg_authid'}],[{schema:'public',table:"x';DELETE"}],[{schema:'public',table:'x'},{schema:'public',table:'x'}]])
    assert.throws(()=>qrPreservationSQL(tables));
});

test('preservation covers the 101st relation and refuses overflow rather than truncating', () => {
  const tables=Array.from({length:128},(_,n)=>({schema:'public',table:`fixture_${n}`}));
  const sql=qrPreservationSQL(tables);assert.match(sql,/FROM public.fixture_100/);assert.match(sql,/FROM public.fixture_127/);
  assert.throws(()=>qrPreservationSQL([...tables,{schema:'public',table:'overflow'}]));
});
