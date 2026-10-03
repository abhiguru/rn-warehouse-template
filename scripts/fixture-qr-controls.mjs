import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';

export function qrConfig(c) {
  assert.equal(c.scope, 'isolated-fictional-synthetic-qr');
  assert.equal(c.origin, 'https://backend-core.example.test');
  assert.equal(c.displayName, 'Fictional Core Warehouse');
  assert.equal(c.instanceId, 'b0ec3933-5258-4bd5-87f4-d57b13a78971');
  assert.equal(c.expectedSelectionChange, false);
  assert.equal(c.expectedOTPs, 0);
  for (const key of ['soakConfig', 'caseDirectory', 'cameraPreparation', 'cameraOwnerProof'])
    assert.ok(isAbsolute(c[key]), 'ABSOLUTE_QR_INPUT_REQUIRED');
  for (const key of ['fixtureGuardSHA256', 'assetSHA256', 'artifactSHA256'])
    assert.match(c[key], /^[a-f0-9]{64}$/);
  return c;
}

// Catalog-derived identifiers are still validated before entering SQL. Only
// fixture-owned application/auth/storage tables are observed; no values leave
// PostgreSQL except aggregate digests.
export function qrPreservationSQL(tables) {
  assert.ok(Array.isArray(tables) && tables.length > 0 && tables.length <= 128);
  const keys = new Set();
  const expressions = tables.map(({ schema, table }) => {
    assert.ok(['public', 'warehouse_security', 'storage', 'auth'].includes(schema));
    assert.match(table, /^[a-z][a-z0-9_]{0,62}$/);
    const key = `${schema}.${table}`;
    assert.ok(!keys.has(key), 'DUPLICATE_RELATION'); keys.add(key);
    return `'${key}',(SELECT encode(extensions.digest(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb)::text,'sha256'),'hex') FROM ${schema}.${table} x)`;
  });
  // jsonb_build_object accepts at most 100 arguments; concatenate individually
  // built objects so the explicit 128-table cap remains executable.
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT ${expressions.map(e => `jsonb_build_object(${e})`).join(' || ')};
COMMIT;`;
}
