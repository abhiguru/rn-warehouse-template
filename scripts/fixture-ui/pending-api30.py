#!/usr/bin/env python3
"""Owned reserved pending customer: cold persistence/status without OTP or login."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,sys,time,traceback,xml.etree.ElementTree as ET
from pathlib import Path
spec=importlib.util.spec_from_file_location('auth',Path(__file__).with_name('auth-api30.py'));auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth);soak=auth.soak
os.umask(0o077)
MESSAGE='Your enrollment is awaiting administrator approval. Check again later.'
def main(path):
 case=json.loads(soak.private(path).read_text());assert case['pendingReadOnly'] is True;c,i=soak.config(case['soakConfig']);d=auth.Auth(c,i,'unused',0);scripts=Path(__file__).parent.parent
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-auth-observe.mjs'),[str(Path(path).resolve()),phase]);assert q.returncode==0,'Pending owner/state observer refused'
 observe('guard');fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists();e.mkdir(mode=0o700);d.e=e;d.file=e/'pending-result.json';d.state.update(phases=[],otpRequests=0,configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());d.save()
 def pending(label):
  tree=d.wait('Enrollment status');d.wait(MESSAGE);assert not any(n.get('content-desc') in ['Orders tab','Queue tab','Invoices tab','GRN tab'] for n in tree.iter('node'));d.archive(label);d.state['phases'].append(label);d.save()
 try:
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30' and d.adb('shell','getprop','ro.build.version.sdk')=='30' and d.adb('shell','getenforce')=='Enforcing'
  p=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p) and d.adb('shell','sha256sum',p[8:]).split()[0]==c['apkSHA256'];d.health(True);observe('before')
  for n in range(1,4):
   d.adb('shell','am','force-stop',soak.PACKAGE);raw=d.adb('exec-out','cat','/data/user/0/'+soak.PACKAGE+'/shared_prefs/SecureStore.xml');names=[x.get('name','') for x in ET.fromstring(raw)];meta={k:any(k in name for name in names) for k in ['secure_enrollment_token','secure_auth_token','secure_refresh_token','cached_user_profile']};assert meta['secure_enrollment_token'] and not any(meta[k] for k in ['secure_auth_token','secure_refresh_token','cached_user_profile']);(e/('secure-presence-'+str(n)+'.json')).write_text(json.dumps(meta)+'\n');del raw,names
   d.adb('shell','monkey','-p',soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');pending('cold-pending-'+str(n))
  d.tap('Check status');pending('explicit-status-check');d.adb('shell','input','keyevent','3');time.sleep(2);d.adb('shell','monkey','-p',soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');pending('foreground-pending');observe('after');d.state.update(status='PASS',coldLaunches=3,foregroundRecovery=True,explicitStatusChecks=1,completedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat());d.save()
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',exceptionType=type(error).__name__,failureSite=Path(last.filename).name+':'+str(last.lineno),reason='Pending test stopped; preserve evidence; no OTP or retry');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('{"status":"PASS","scope":"native pending persistence and status"}')
 except Exception:print('{"status":"FAIL","category":"PENDING_STOPPED"}');sys.exit(1)
