#!/usr/bin/env python3
"""Three owned cold launches and foreground recovery; no login or business writes."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,sqlite3,subprocess,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('navigation',Path(__file__).with_name('navigation-api30.py'));nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav);soak=nav.soak
os.umask(0o077)
def main(path):
 case=json.loads(soak.private(path).read_text());assert case['case']=='cold-lifecycle';c,i=soak.config(case['soakConfig']);d=nav.Navigation(c,i,'unused',0);scripts=Path(__file__).parent.parent
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-navigation-observe.mjs'),[str(Path(path).resolve()),phase]);assert q.returncode==0,'Released owned fixture and independent state required'
 observe('guard')
 fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists();e.mkdir(mode=0o700);d.e=e;d.file=e/'navigation-result.json';d.state.update(phases=[],configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest(),businessWrites=0,otpRequests=0);d.save()
 def selection():
  d.adb('shell','am','force-stop',soak.PACKAGE)
  q=subprocess.run([c['adb'],'-s',i['serial'],'exec-out','cat','/data/user/0/'+soak.PACKAGE+'/databases/RKStorage'],capture_output=True,timeout=15);assert q.returncode==0 and len(q.stdout)<1048576
  db=sqlite3.connect(':memory:');db.deserialize(q.stdout);assert db.execute('PRAGMA quick_check').fetchone()[0]=='ok';row=db.execute("SELECT value FROM catalystLocalStorage WHERE key='operator_server_v1'").fetchone();assert row;v=json.loads(row[0]);db.close();assert v['origin']=='https://backend-core.example.test' and v['instanceId']==case['instanceId'];return {'origin':v['origin'],'instanceId':v['instanceId']}
 def read(label):
  d.wait('Orders tab');d.tap('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');d.wait(c['orderLabel']);deadline=time.monotonic()+20
  while time.monotonic()<deadline:
   q=d.backend_process(c['httpObserver'],[since],timeout=20);v=nav.decode_observation(q.returncode,q.stdout.decode());
   if v['status']=='PASS':break
   assert v['status']=='WAIT';time.sleep(.5)
  else:raise AssertionError('Actual fresh Orders read required')
  d.state['phases'].append({'phase':label,'actualOrders':v});d.save()
 try:
  audit=json.loads(soak.private(case['artifactAudit']).read_text());assert audit['status']=='PASS' and audit.get('sha256',audit.get('artifact',{}).get('sha256'))==c['apkSHA256']
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30' and d.adb('shell','getprop','ro.build.version.sdk')=='30' and d.adb('shell','getenforce')=='Enforcing'
  installed=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',installed);assert d.adb('shell','sha256sum',installed[8:]).split()[0]==c['apkSHA256'];nav.owned_reverse_route(d.adb('reverse','--list'),18443);d.health(True);observe('before')
  for n in range(1,4):
   persisted=selection();d.cold();read('COLD_'+str(n));d.adb('shell','input','keyevent','3');time.sleep(2);d.adb('shell','monkey','-p',soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');read('FOREGROUND_'+str(n))
  observe('after');d.state.update(status='PASS',coldLaunches=3,foregroundRecoveries=3,persistedSelection=persisted);d.save()
 except Exception:d.state.update(status='FAIL',reason='Lifecycle stopped; preserve attempt; no login or replay');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('{"status":"PASS","scope":"native cold and foreground lifecycle"}')
 except Exception:print('{"status":"FAIL","category":"LIFECYCLE_STOPPED"}');sys.exit(1)
