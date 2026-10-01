// Read private native evidence and apply the pure reconciliation predicates.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assertReleased, privateJSON } from './fixture-session-guards.mjs';
import { receiptConfig, receiptCoreSnapshot, receiptSnapshotShape } from './fixture-receipt-snapshot.mjs';
import { lossEvidence, retryEvidence } from './fixture-write-reconciliation.mjs';
try {
  const [path, mode] = process.argv.slice(2);
  assert.ok(['loss', 'retry'].includes(mode));
  const c = receiptConfig(privateJSON(path)); assertReleased(c);
  const read = name => privateJSON(resolve(c.caseDirectory, name+'.json'));
  const originalBefore = read('baseline').snapshot;
  receiptSnapshotShape(c, originalBefore, 'baseline');
  const before = receiptCoreSnapshot(originalBefore);
  const loss = { ...read('after-loss'), nativeError: read('native-loss').nativeError };
  receiptSnapshotShape(c, loss.snapshot, 'after-loss');
  const coreLoss = { ...loss, snapshot: receiptCoreSnapshot(loss.snapshot) };
  lossEvidence(c, before, coreLoss);
  if (mode === 'retry') {
    const retry = read('after-retry'); receiptSnapshotShape(c, retry.snapshot, 'after-retry');
    retryEvidence(c, before, coreLoss, { ...retry, snapshot: receiptCoreSnapshot(retry.snapshot), nativeSuccess: read('native-retry').nativeSuccess, unchangedForm: read('native-retry').unchangedForm });
  }
  console.log(JSON.stringify({ status: 'PASS', phase: mode, scope: 'native-evidence-and-database-reconciliation' }));
} catch {
  console.error(JSON.stringify({ status: 'FAIL', category: 'RECEIPT_EVIDENCE_REJECTED' }));
  process.exitCode = 1;
}
