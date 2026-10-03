#!/usr/bin/env python3
"""Own the native actor lock while one bounded ordinary API image preparation executes."""
import fcntl,json,os,subprocess,sys
from pathlib import Path
os.umask(0o077)
def main(path):
 p=Path(path).resolve();c=json.loads(p.read_text());ui=json.loads(Path(c['soakConfig']).read_text());script=Path(__file__).parent.parent/'fixture-b-image-api.mjs'
 q=subprocess.run([ui['node'],str(script),str(p),'guard'],capture_output=True,timeout=25);assert q.returncode==0
 lock=Path(c['soakConfig']).parent/'fixture-session-actor.lock';fd=os.open(lock,os.O_RDWR|os.O_NOFOLLOW)
 try:
  fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  q=subprocess.run([ui['node'],str(script),str(p),'execute'],pass_fds=(fd,),env={**os.environ,'WAREHOUSE_B_IMAGE_ACTOR_FD':str(fd)},timeout=3600)
  assert q.returncode==0
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1])
 except Exception:print('{"status":"FAIL","category":"OWNED_B_IMAGE_STOPPED"}');sys.exit(1)
