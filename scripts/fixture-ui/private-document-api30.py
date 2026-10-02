#!/usr/bin/env python3
"""Hold the existing actor lock for one bounded ordinary document API case."""
import fcntl,json,os,subprocess,sys
from pathlib import Path
os.umask(0o077)
def main(path):
 c=json.loads(Path(path).read_text());ui=json.loads(Path(c['soakConfig']).read_text());script=Path(__file__).parent.parent/'fixture-private-document-api.mjs'
 q=subprocess.run([ui['node'],str(script),path,'guard'],capture_output=True,timeout=25);assert q.returncode==0
 fd=os.open(Path(c['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW)
 try:
  fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  q=subprocess.run([ui['node'],str(script),path,'execute'],pass_fds=(fd,),env={**os.environ,'WAREHOUSE_PRIVATE_DOCUMENT_ACTOR_FD':str(fd)},timeout=540);assert q.returncode==0
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1])
 except Exception:print('{"status":"FAIL","category":"PRIVATE_DOCUMENT_ACTOR_STOPPED"}');sys.exit(1)
