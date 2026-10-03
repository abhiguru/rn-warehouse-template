#!/usr/bin/env python3
"""Own the shared actor lock while installing exactly one expiry appointment."""
import fcntl,json,os,subprocess,sys
from pathlib import Path
os.umask(0o077)
def main(path):
 from importlib.util import spec_from_file_location,module_from_spec
 spec=spec_from_file_location('expiry',Path(__file__).with_name('natural-expiry-api30.py'));m=module_from_spec(spec);spec.loader.exec_module(m)
 c=json.loads(m.private(path).read_text());native=json.loads(m.private(c['configuration']).read_text());lock=m.private(native['actorLock']);scripts=Path(__file__).parent.parent
 q=subprocess.run([native['node'],str(scripts/'fixture-natural-expiry-scheduler.mjs'),path,'guard'],capture_output=True,timeout=120);assert q.returncode==0
 fd=os.open(lock,os.O_RDWR|os.O_NOFOLLOW)
 try:
  fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);env={**os.environ,'WAREHOUSE_EXPIRY_SCHEDULER_ACTOR_FD':str(fd)}
  q=subprocess.run([native['node'],str(scripts/'fixture-natural-expiry-scheduler.mjs'),path,'schedule'],env=env,pass_fds=(fd,),timeout=120);assert q.returncode==0
 finally:os.close(fd)
if __name__=='__main__':
 try:main(str(Path(sys.argv[1]).resolve()))
 except Exception:print('{"status":"BLOCKED","category":"EXPIRY_SCHEDULER_STOPPED","automaticRetry":false}');sys.exit(2)
