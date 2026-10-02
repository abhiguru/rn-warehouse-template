#!/usr/bin/env python3
"""One dedicated naturally expired session check; no OTP, login or retries."""
import datetime,fcntl,hashlib,json,os,re,shlex,subprocess,sys,time,xml.etree.ElementTree as ET
from pathlib import Path
os.umask(0o077)
PACKAGE='in.gurucold.warehouse.fixture'
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def private(p,directory=False):
 p=Path(p);s=p.lstat();assert p.is_absolute() and p.resolve()==p and not p.is_symlink() and s.st_uid==os.getuid() and s.st_mode&0o077==0
 assert p.is_dir() if directory else p.is_file();return p

def main(path):
 c=json.loads(private(path).read_text());private(Path(path).parent,True);assert c['scope']=='isolated-fictional-dedicated-natural-expiry'
 assert re.fullmatch(r'DedicatedExpiry_API30_[a-z0-9]+',c['avd']);assert re.fullmatch(r'emulator-\d+',c['serial'])
 assert re.fullmatch(r'warehouse-fixture-emulator-expiry-[a-z0-9-]+\.service',c['emulatorUnit'])
 assert c['appointment']['avd']==c['avd'];deadline=datetime.datetime.fromisoformat(c['appointment']['deadlineUTC'].replace('Z','+00:00'))
 scripts=Path(__file__).parent.parent
 for p,h in c['toolingSHA256'].items():assert digest(scripts/p)==h
 assert c['toolingSHA256']['fixture-ui/natural-expiry-api30.py']==digest(__file__)
 def run(args,timeout=25):
  remaining=(deadline-datetime.datetime.now(datetime.timezone.utc)).total_seconds();assert remaining>0
  q=subprocess.run(args,capture_output=True,timeout=min(timeout,remaining));assert q.returncode==0,'Owned expiry operation refused';return q.stdout.decode(errors='replace').strip()
 def observe(phase):
  return run(['/usr/bin/sg','docker','-c',shlex.join([c['node'],str(scripts/'fixture-natural-expiry-observe.mjs'),path,phase])],45)
 def adb(*args):return run([c['adb'],'-s',c['serial'],*args])
 observe('guard')
 lock=private(c['actorLock']);fd=os.open(lock,os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 try:
  observe('guard')
  proof=json.loads(private(c['preparationProof']).read_text());assert proof['device']['avd']==c['avd']
  assert c['preservedAVDFiles'] and len(c['preservedAVDFiles'])<=256
  avdroot=private(c['avdDirectory'],True);assert avdroot.name==c['avd']+'.avd'
  for name,h in c['preservedAVDFiles'].items():
   assert not Path(name).is_absolute() and '..' not in Path(name).parts
   p=avdroot/name;assert p.resolve()==p and p.is_file() and not p.is_symlink();assert digest(p)==h,'Preserved AVD changed'
  props=dict(row.split('=',1) for row in run(['systemctl','--user','show',c['emulatorUnit'],'-p','ActiveState','-p','Restart','-p','NRestarts','-p','RuntimeMaxUSec','-p','KillMode','-p','FragmentPath','-p','ExecStart']).splitlines())
  assert props['ActiveState']=='inactive' and props['Restart']=='no' and props['NRestarts']=='0' and props['KillMode']=='control-group' and props['RuntimeMaxUSec']=='1h'
  fragment=private(props['FragmentPath']);assert digest(fragment)==c['emulatorUnitSHA256']
  assert '-avd '+c['avd']+' ' in props['ExecStart'] and '-port '+c['serial'].split('-')[1]+' ' in props['ExecStart']
  devices=run([c['adb'],'devices']);assert not any(row.startswith(c['serial']+'\t') for row in devices.splitlines())
  e=Path(c['caseDirectory']);assert not e.exists();e.mkdir(mode=0o700)
  state={'status':'RUNNING','bootAttempted':False,'OTPRequested':False,'automaticRetry':False}
  def save():
   (e/'executor-status.json').write_text(json.dumps(state,indent=2)+'\n')
  save();observe('before');state['bootAttempted']=True;save();run(['systemctl','--user','start',c['emulatorUnit']],30)
  boot_end=min(time.monotonic()+300,time.monotonic()+(deadline-datetime.datetime.now(datetime.timezone.utc)).total_seconds())
  while True:
   try:
    if adb('shell','getprop','sys.boot_completed')=='1':break
   except (AssertionError,subprocess.TimeoutExpired):pass
   assert time.monotonic()<boot_end,'Bounded owned boot unavailable';time.sleep(1)
  assert adb('emu','avd','name').splitlines()[0]==c['avd'];assert adb('shell','getprop','ro.build.version.sdk')=='30';assert adb('shell','getprop','ro.product.cpu.abi')=='x86_64';assert adb('shell','getenforce')=='Enforcing'
  package=adb('shell','pm','path',PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',package);assert adb('shell','sha256sum',package[8:]).split()[0]==c['artifactSHA256']
  assert 'foobnix' not in adb('shell','pm','list','packages')
  assert adb('shell','sha256sum','/system/etc/hosts').split()[0]==c['deviceHostsSHA256']
  primary=dict(row.split('=',1) for row in run(['systemctl','--user','show',c['primaryUnit'],'-p','ActiveState','-p','SubState','-p','Restart','-p','NRestarts']).splitlines());assert primary=={'Restart':'no','NRestarts':'0','ActiveState':'active','SubState':'running'}
  routes=adb('reverse','--list');assert not any('tcp:443' in row for row in routes.splitlines());adb('reverse','tcp:443','tcp:18443')
  cap=c['uiCapture'];assert digest(cap['jar'])==cap['sha256'];assert adb('shell','sha256sum',cap['remotePath']).split()[0]==cap['sha256']
  adb('shell','am','force-stop',PACKAGE);adb('shell','monkey','-p',PACKAGE,'-c','android.intent.category.LAUNCHER','1')
  end=time.monotonic()+90
  while True:
   assert 'Application Not Responding' not in adb('shell','dumpsys','window')
   assert not re.search(r'\bam_anr\b|\bam_crash\b',adb('logcat','-b','events','-d'))
   assert not re.search(r'FATAL EXCEPTION|Fatal signal',adb('logcat','-b','crash','-d'))
   raw=adb('exec-out','env','CLASSPATH=/system/framework/uiautomator.jar:'+cap['remotePath'],'app_process','/system/bin','FixtureUiCapture');m=re.search(r'(<hierarchy\b.*?</hierarchy>)',raw,re.S)
   if m:
    tree=ET.fromstring(m.group(1));labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
    if 'Send OTP' in labels:
     assert 'Change warehouse server' in labels and not labels.intersection({'Orders tab','Invoices tab','GRN tab','Stock tab','Choose your warehouse server'});break
   assert time.monotonic()<end,'Login required after actual expiry';time.sleep(1)
  assert adb('shell','command','-v','sqlite3')=='/system/bin/sqlite3'
  raw=adb('shell',shlex.join(['/system/bin/sqlite3','-readonly','/data/user/0/'+PACKAGE+'/databases/RKStorage',"SELECT value FROM catalystLocalStorage WHERE key='operator_server_v1';"]));assert len(raw)<=4096;selected=json.loads(raw);assert selected['origin']=='https://backend-core.example.test' and selected['instanceId']=='b0ec3933-5258-4bd5-87f4-d57b13a78971'
  native={'loginRequired':True,'protectedTabsVisible':False,'OTPRequested':False,'artifactMatches':True,'ownedDedicatedAVD':True,'selectedServerMatches':True}
  with (e/'native-result.json').open('x') as f:f.write(json.dumps(native)+'\n')
  observe('after');adb('emu','kill')
  stop_end=time.monotonic()+30
  while run(['systemctl','--user','show',c['emulatorUnit'],'-p','ActiveState','--value'])!='inactive':
   assert time.monotonic()<stop_end,'Owned clean stop not verified';time.sleep(.5)
  state.update(status='PASS',cleanStopVerified=True);save();print('{"status":"PASS","scope":"dedicated natural-expiry native acceptance"}')
 except Exception as error:
  if 'state' in locals():state.update(status='BLOCKED',exceptionType=type(error).__name__,reason='Preserve partial expiry attempt; no automatic retry');save()
  raise
 finally:os.close(fd)
if __name__=='__main__':
 try:main(str(Path(sys.argv[1]).resolve()))
 except Exception:print('{"status":"BLOCKED","category":"DEDICATED_NATURAL_EXPIRY_STOPPED","automaticRetry":false}');sys.exit(2)
