// Read-only catalog of the five already committed fictional invoice regressions.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertReleased, privateJSON } from './fixture-session-guards.mjs';
import { navigationConfig } from './fixture-navigation-guards.mjs';
process.umask(0o077);
try {
  const [path] = process.argv.slice(2), c = navigationConfig(privateJSON(path));
  assert.equal(c.kind, 'invoice-read-only'); assert.equal(c.case, 'same-server');
  assertReleased(c);
  const guard = resolve(c.backendCheckout, 'tests/operator-fixture.mjs');
  assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'), c.fixtureGuardSHA256);
  process.env.WAREHOUSE_STATE_DIR = c.backendState;
  const { operatorFixture } = await import(pathToFileURL(guard).href), { env } = operatorFixture();
  assert.equal(privateJSON(resolve(c.backendState, 'public/instance.json')).instanceId, c.instanceId);
  const q = spawnSync('docker', ['exec', '-i', '-e', 'PGPASSWORD', `${env.WAREHOUSE_PROJECT_NAME}-db-1`,
    'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    encoding:'utf8', timeout:15000, maxBuffer:1048576, env:{...process.env, PGPASSWORD:env.POSTGRES_PASSWORD},
    input:`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT jsonb_agg(jsonb_build_object('id',i.id,'number',i.inv_no,'year',i.inv_fin_year,
 'grnId',g.id,'record',g.gr_no,'total',i.total,'tax',i.tax_amount) ORDER BY i.inv_no)
FROM public.invoice i JOIN public.goodsreceived g ON g.id=i.gr_id
WHERE i.inv_fin_year=2026 AND i.inv_no BETWEEN 20261001 AND 20261005
AND g.gr_no IN ('IRP01','IRP02','IRP03','IRP04','IRP05'); COMMIT;`
  });
  assert.equal(q.status,0,'PRIVATE_READONLY_CATALOG_FAILED'); const rows=JSON.parse(q.stdout.trim());
  assert.equal(rows.length,5);
  const totals=[147,200,252,177,182], taxes=[7,10,12,9,9], uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  rows.forEach((v,index)=>{assert.match(v.id,uuid);assert.match(v.grnId,uuid);assert.equal(v.record,`IRP0${index+1}`);
    assert.equal(v.number,20261001+index);assert.equal(v.total,totals[index]);assert.equal(v.tax,taxes[index]);});
  writeFileSync(resolve(c.caseDirectory,'invoice-catalog.json'),JSON.stringify({status:'PASS',rows}),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:'PASS',scope:'readonly-fictional-invoice-catalog'}));
} catch { console.error(JSON.stringify({status:'FAIL',category:'INVOICE_CATALOG_REFUSED'})); process.exitCode=1; }
