// Pure evidence checks only. These functions never permit or perform a write.
import assert from 'node:assert/strict';
const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function writeBaseline(c, s) {
  assert.ok(['receipt', 'dispatch'].includes(c.kind), 'WRITE_KIND_REQUIRED');
  assert.ok(['before-upstream', 'after-upstream-success'].includes(c.phase), 'FAULT_PHASE_REQUIRED');
  assert.match(c.record, /^FXF\d{2,5}$/);
  assert.match(c.artifactSHA256, digest);
  assert.match(c.instanceId, uuid);
  assert.ok(Number.isSafeInteger(c.quantity) && c.quantity > 0, 'POSITIVE_FIXTURE_QUANTITY_REQUIRED');
  assert.equal(s.instanceId, c.instanceId, 'INSTANCE_MISMATCH');
  assert.deepEqual(s.headerIds, [], 'RECORD_ALREADY_USED');
  assert.deepEqual(s.lineIds, [], 'RECORD_ALREADY_USED');
  assert.equal(s.quantity, 0, 'RECORD_ALREADY_USED');
  assert.equal(s.cacheCount, 0, 'CACHE_ALREADY_USED');
  assert.equal(s.invoices, 0, 'UNEXPECTED_INVOICE');
  assert.ok(Number.isSafeInteger(s.stock) && s.stock >= 0, 'STOCK_REQUIRED');
  assert.ok(c.kind === 'receipt' ? s.stock === 0 : s.stock >= c.quantity, 'BASELINE_STOCK_INVALID');
  assert.match(s.unrelatedBusinessHash, digest);
}

export function committed(c, before, s) {
  assert.equal(s.instanceId, c.instanceId, 'INSTANCE_MISMATCH');
  assert.equal(s.unrelatedBusinessHash, before.unrelatedBusinessHash, 'UNRELATED_BUSINESS_CHANGED');
  assert.equal(s.headerIds.length, 1, 'EXACTLY_ONE_HEADER_REQUIRED');
  assert.equal(s.lineIds.length, 1, 'EXACTLY_ONE_LINE_REQUIRED');
  assert.match(s.headerIds[0], uuid);
  assert.match(s.lineIds[0], uuid);
  assert.equal(s.quantity, c.quantity, 'QUANTITY_MISMATCH');
  assert.equal(s.stock, before.stock + (c.kind === 'receipt' ? c.quantity : -c.quantity), 'STOCK_MISMATCH');
  // These reserved cases do not save an invoice; dispatch calculation is not persistence.
  assert.equal(s.invoices, 0, 'UNEXPECTED_INVOICE');
  assert.equal(s.cacheCount, 1, 'EXACTLY_ONE_CACHED_RESULT_REQUIRED');
  assert.equal(s.cacheSuccess, true, 'CACHED_SUCCESS_REQUIRED');
  assert.equal(s.cachedHeaderId, s.headerIds[0], 'CACHED_HEADER_MISMATCH');
}

export function lossEvidence(c, before, evidence) {
  writeBaseline(c, before);
  assert.equal(evidence.artifactSHA256, c.artifactSHA256, 'ARTIFACT_MISMATCH');
  const f = evidence.fault;
  assert.equal(f.record, c.record, 'FAULT_RECORD_MISMATCH');
  assert.equal(f.path, c.kind === 'receipt' ? '/rest/v1/rpc/save_grn' : '/rest/v1/rpc/create_dispatch_with_stock_check', 'FAULT_PATH_MISMATCH');
  assert.equal(f.state, c.phase === 'before-upstream' ? 'DROPPED_BEFORE_UPSTREAM' : 'DROPPED_AFTER_UPSTREAM_SUCCESS', 'FAULT_NOT_TRIGGERED');
  assert.match(f.key, new RegExp(`^warehouse-${c.kind === 'receipt' ? 'grn' : 'dispatch'}-[a-f0-9]{64}$`));
  assert.equal(evidence.nativeError, true, 'NATIVE_ERROR_REQUIRED');
  assert.deepEqual(evidence.requestObservations, { observations: [], overflow: false }, 'REQUEST_BEFORE_RECONCILIATION');
  if (c.phase === 'before-upstream') assert.deepEqual(evidence.snapshot, before, 'UNEXPECTED_FIRST_COMMIT');
  else committed(c, before, evidence.snapshot);
}

export function retryEvidence(c, before, loss, retry) {
  lossEvidence(c, before, loss);
  assert.equal(retry.artifactSHA256, c.artifactSHA256, 'ARTIFACT_MISMATCH');
  // Consume the separate relay observation, never its retained first-fault key.
  assert.equal(retry.requestObservations?.overflow, false, 'OBSERVATION_OVERFLOW');
  assert.equal(retry.requestObservations.observations.length, 1, 'ONE_RETRY_REQUEST_REQUIRED');
  const observation = retry.requestObservations.observations[0];
  assert.equal(observation.sequence, 1, 'RETRY_SEQUENCE_MISMATCH');
  assert.equal(observation.path, loss.fault.path, 'RETRY_PATH_MISMATCH');
  assert.equal(observation.record, c.record, 'RETRY_RECORD_MISMATCH');
  assert.equal(observation.stateWhenObserved, loss.fault.state, 'RETRY_BEFORE_LOSS');
  assert.equal(observation.sameKey, true, 'RETRY_KEY_MISMATCH');
  assert.equal(observation.key, loss.fault.key, 'RETRY_KEY_MISMATCH');
  assert.equal(retry.unchangedForm, true, 'FORM_CHANGED');
  assert.equal(retry.nativeSuccess, true, 'NATIVE_SUCCESS_REQUIRED');
  committed(c, before, retry.snapshot);
  if (c.phase === 'after-upstream-success') assert.deepEqual(retry.snapshot, loss.snapshot, 'RETRY_CHANGED_COMMITTED_OPERATION');
}
