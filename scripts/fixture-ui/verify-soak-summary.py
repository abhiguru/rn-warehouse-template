#!/usr/bin/env python3
"""Read-only final reconciliation of the nine explicitly reviewed native blocks."""
import importlib.util
import json
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location('soak', Path(__file__).with_name('soak-api30.py'))
soak = importlib.util.module_from_spec(spec)
spec.loader.exec_module(soak)
config, inputs = soak.config(sys.argv[1])
results = []
hashes = []
verification_count = None
for number in range(1, 10):
    step = f'soak-{number:02d}'
    check = soak.Soak(config, inputs, step, 3200)
    check.verify()
    result = json.loads(soak.private(check.file).read_text())
    results.append(result)
    for name in ['session-before.json', 'session-after.json']:
        snapshot = json.loads(soak.private(check.e / name).read_text())
        if verification_count is None:
            verification_count = snapshot['verifiedCount']
        assert snapshot['verifiedCount'] == verification_count, 'A new administrator OTP appeared'
        native = [s for s in snapshot['sessions'] if s['id'] == config['nativeSessionId']]
        assert len(native) == 1, 'Original current native session missing'
        hashes.append(native[0]['hash'])
assert sum(r['soakSeconds'] for r in results) >= 8 * 3600
assert len(set(hashes)) >= 5, 'Insufficient observed renewal of the bound native refresh credential'
summary = {
    'status': 'PASS', 'artifact': inputs['artifact'], 'blocks': len(results),
    'soakSeconds': sum(r['soakSeconds'] for r in results),
    'cycles': sum(len(r['cycles']) for r in results),
    'nativeCredentialRotationsObserved': len(set(hashes)) - 1,
    'limitations': 'Isolated fictional emulator native read/lifecycle/session soak. No physical, cellular, real-SMS, revoked-session or production acceptance.',
}
# Idempotent read-only verification: summary on stdout, no ledger rewrite.
print(json.dumps(summary))
