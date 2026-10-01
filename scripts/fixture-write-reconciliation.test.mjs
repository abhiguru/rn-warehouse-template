import test from 'node:test';
import assert from 'node:assert/strict';
import { writeBaseline, lossEvidence, retryEvidence } from './fixture-write-reconciliation.mjs';
const id = '11111111-1111-4111-8111-111111111111';
function fixture(kind, phase) {
  const c = { kind, phase, record: 'FXF901', artifactSHA256: 'a'.repeat(64), instanceId: id, quantity: 2 };
  const before = { instanceId: id, headerIds: [], lineIds: [], quantity: 0, stock: kind === 'receipt' ? 0 : 10, cacheCount: 0, invoices: 0, unrelatedBusinessHash: 'b'.repeat(64) };
  const saved = { ...before, headerIds: [id], lineIds: ['22222222-2222-4222-8222-222222222222'], quantity: 2, stock: kind === 'receipt' ? 2 : 8, cacheCount: 1, cacheSuccess: true, cachedHeaderId: id };
  const fault = { record: c.record, path: kind === 'receipt' ? '/rest/v1/rpc/save_grn' : '/rest/v1/rpc/create_dispatch_with_stock_check', state: phase === 'before-upstream' ? 'DROPPED_BEFORE_UPSTREAM' : 'DROPPED_AFTER_UPSTREAM_SUCCESS', key: `warehouse-${kind === 'receipt' ? 'grn' : 'dispatch'}-${'c'.repeat(64)}` };
  const loss = { artifactSHA256: c.artifactSHA256, fault, nativeError: true, requestObservations: { observations: [], overflow: false }, snapshot: phase === 'before-upstream' ? before : saved };
  const retry = { artifactSHA256: c.artifactSHA256, requestObservations: { overflow: false, observations: [{ sequence: 1, path: fault.path, record: c.record, stateWhenObserved: fault.state, key: fault.key, sameKey: true }] }, unchangedForm: true, nativeSuccess: true, snapshot: saved };
  return { c, before, loss, retry };
}
for (const kind of ['receipt', 'dispatch']) for (const phase of ['before-upstream', 'after-upstream-success']) {
  test(`${kind} ${phase}: reconcile loss then exactly one unchanged retry`, () => {
    const { c, before, loss, retry } = fixture(kind, phase);
    retryEvidence(c, before, loss, retry);
    for (const snapshot of [{ ...retry.snapshot, stock: 99 }, { ...retry.snapshot, cacheCount: 2 }, { ...retry.snapshot, cachedHeaderId: 'wrong' }, { ...retry.snapshot, unrelatedBusinessHash: 'd'.repeat(64) }, { ...retry.snapshot, invoices: 1 }]) {
      assert.throws(() => retryEvidence(c, before, loss, { ...retry, snapshot }));
    }
  });
}
test('occupied records and untriggered/wrong fault evidence fail closed', () => {
  const { c, before, loss, retry } = fixture('dispatch', 'before-upstream');
  assert.throws(() => writeBaseline(c, retry.snapshot), /RECORD_ALREADY_USED/);
  for (const patch of [{ state: 'ARMED' }, { record: 'FXF902' }, { path: '/wrong' }]) {
    assert.throws(() => lossEvidence(c, before, { ...loss, fault: { ...loss.fault, ...patch } }));
  }
  assert.throws(() => lossEvidence(c, before, { ...loss, snapshot: retry.snapshot }), /UNEXPECTED_FIRST_COMMIT/);
});
test('unchanged retained relay key alone cannot establish same-key native retry', () => {
  const { c, before, loss, retry } = fixture('receipt', 'after-upstream-success');
  for (const patch of [{ requestObservations: undefined }, { requestObservations: { ...retry.requestObservations, overflow: true } }, { unchangedForm: false }, { nativeSuccess: false }, { artifactSHA256: 'f'.repeat(64) }]) {
    assert.throws(() => retryEvidence(c, before, loss, { ...retry, ...patch }));
  }
  const replaced = { ...retry.snapshot, headerIds: ['33333333-3333-4333-8333-333333333333'], cachedHeaderId: '33333333-3333-4333-8333-333333333333' };
  assert.throws(() => retryEvidence(c, before, loss, { ...retry, snapshot: replaced }), /RETRY_CHANGED/);
});

test('retry observer rejects duplicate, concurrent, unrelated and changed-key requests', () => {
  const { c, before, loss, retry } = fixture('dispatch', 'after-upstream-success');
  const o = retry.requestObservations.observations[0];
  assert.throws(() => retryEvidence(c, before, { ...loss, requestObservations: retry.requestObservations }, retry), /REQUEST_BEFORE_RECONCILIATION/);
  for (const observations of [[], [o, o], [{ ...o, sequence: 2 }], [{ ...o, path: '/wrong' }], [{ ...o, record: 'FXF902' }], [{ ...o, stateWhenObserved: 'MATCHED' }], [{ ...o, sameKey: false }], [{ ...o, key: 'warehouse-dispatch-' + 'd'.repeat(64) }]]) {
    assert.throws(() => retryEvidence(c, before, loss, { ...retry, requestObservations: { overflow: false, observations } }));
  }
});
