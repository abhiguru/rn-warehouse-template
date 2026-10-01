import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchConfig, dispatchSnapshotSQL, dispatchSnapshotShape } from './fixture-dispatch-snapshot.mjs';
const c = { scope: 'isolated-fictional-dispatch-observation', kind: 'dispatch', record: 'FXF901', sourceReceipt: 'FXF900', instanceId: '11111111-1111-4111-8111-111111111111', stockLineId: '22222222-2222-4222-8222-222222222222', artifactSHA256: 'a'.repeat(64), fixtureGuardSHA256: 'b'.repeat(64), phase: 'before-upstream', quantity: 2 };
test('observation accepts only reserved bound partial-dispatch inputs', () => {
  dispatchConfig(c);
  for (const patch of [{ record: "FXF901'; DELETE FROM public.dispatch;--" }, { sourceReceipt: 'REAL01' }, { stockLineId: "x'" }, { instanceId: 'wrong' }, { quantity: 0 }, { quantity: 1.5 }, { quantity: NaN }, { kind: 'receipt' }, { phase: 'unknown' }, { sourceReceipt: c.record }]) assert.throws(() => dispatchConfig({ ...c, ...patch }));
  assert.throws(() => dispatchSnapshotSQL(c, "x';COMMIT;--"));
});
test('SQL is a bounded read-only transaction; no mutable values enter SQL except validated identifiers', () => {
  const q = dispatchSnapshotSQL(c, 'warehouse-dispatch-'+'c'.repeat(64));
  assert.match(q, /REPEATABLE READ READ ONLY/); assert.match(q, /statement_timeout='10s'/);
  assert.ok(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b/.test(q));
  assert.match(q, /response->>'dispatch_id'/);
});
test('stock source mismatch, wrong dispatched line and final depletion are refused', () => {
  const s = { sourceBound: true, wrongStockLines: 0, stock: 3 };
  dispatchSnapshotShape(c, s, true);
  for (const patch of [{ sourceBound: false }, { wrongStockLines: 1 }, { stock: 2 }, { stock: 0 }]) assert.throws(() => dispatchSnapshotShape(c, { ...s, ...patch }, true));
});
