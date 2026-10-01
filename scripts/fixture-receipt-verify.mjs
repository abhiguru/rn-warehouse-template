// Read private native evidence and apply the pure reconciliation predicates.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assertReleased, privateJSON } from './fixture-session-guards.mjs';
import { receiptConfig } from './fixture-receipt-snapshot.mjs';
import { lossEvidence, retryEvidence } from './fixture-write-reconciliation.mjs';
try {
  const [path, mode] = process.argv.slice(2);
  assert.ok(['loss', 'retry'].includes(mode));
  const c = receiptConfig(privateJSON(path)); assertReleased(c);
  const read = name => privateJSON(resolve(c.caseDirectory, name+'.json'));
  const before = read('baseline').snapshot;
  const loss = { ...read('after-loss'), nativeError: read('native-loss').nativeError };
  lossEvidence(c, before, loss);
  if (mode === 'retry') retryEvidence(c, before, loss, { ...read('after-retry'), nativeSuccess: read('native-retry').nativeSuccess, unchangedForm: read('native-retry').unchangedForm });
  console.log(JSON.stringify({ status: 'PASS', phase: mode, scope: 'native-evidence-and-database-reconciliation' }));
} catch {
  console.error(JSON.stringify({ status: 'FAIL', category: 'RECEIPT_EVIDENCE_REJECTED' }));
  process.exitCode = 1;
}
