#!/usr/bin/env python3
"""One bounded orchestration unit: draft, independent proof, fault/retry.

The external runner's normal-route checkpoint must surround this whole unit.
Do not checkpoint between a draft that holds the fault route and its guarded
submission driver. No resume, login, seeding or driver fallback is supported.
"""
import hashlib,json,os,subprocess,sys
from pathlib import Path
os.umask(0o077)

def main(path):
    scripts=Path(__file__).parent
    config=json.loads(Path(path).read_text());assert config.get('imagePolicy')=='deferred-single-book-image', 'Image-free native receipt case remains blocked'
    subprocess.run([sys.executable,str(scripts/'receipt-draft-api30.py'),path],check=True,timeout=480)
    c=json.loads(Path(path).read_text());d=Path(c['caseDirectory']);v=json.loads((d/'draft-result.json').read_text())
    assert v['status']=='PASS' and v['businessWriteAttempted'] is False and v['routeHeldForGuardedCase']
    assert v['configSHA256']==hashlib.sha256(Path(path).read_bytes()).hexdigest()
    assert json.loads((d/'baseline.json').read_text())['snapshot']==json.loads((d/'after-draft.json').read_text())['snapshot']
    subprocess.run([sys.executable,str(scripts/'receipt-image-picker-api30.py'),path],check=True,timeout=180)
    # The submission driver independently repeats release, binding, ownership,
    # artifact, fresh review, route, relay and pre-submit database checks.
    subprocess.run([sys.executable,str(scripts/'receipt-case-api30.py'),path],check=True,timeout=480)
if __name__=='__main__':
    try:assert len(sys.argv)==2;main(sys.argv[1])
    except Exception:print(json.dumps({'status':'FAIL','category':'RECEIPT_WORKFLOW_STOPPED_NO_RESUME'}));sys.exit(1)
