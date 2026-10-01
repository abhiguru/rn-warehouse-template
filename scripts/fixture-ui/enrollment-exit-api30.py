#!/usr/bin/env python3
"""Observe real administrator approval and clear the owned enrollment via Sign in."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,sys,traceback
from pathlib import Path
spec=importlib.util.spec_from_file_location('auth',Path(__file__).with_name('auth-api30.py'));auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth);soak=auth.soak
os.umask(0o077)
def main(path):
 case=json.loads(soak.private(path).read_text());assert case['approvedEnrollmentExit'] is True;c,i=soak.config(case['soakConfig']);d=auth.Auth(c,i,'unused',0);scripts=Path(__file__).parent.parent
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-auth-observe.mjs'),[str(Path(path).resolve()),phase]);assert q.returncode==0,'Approved enrollment observer refused'
 observe('guard');fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists();e.mkdir(mode=0o700);d.e=e;d.file=e/'enrollment-exit-result.json';d.state.update(phases=[],otpRequests=0,configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());d.save()
 try:
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30' and d.adb('shell','getprop','ro.build.version.sdk')=='30' and d.adb('shell','getenforce')=='Enforcing'
  p=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p) and d.adb('shell','sha256sum',p[8:]).split()[0]==c['apkSHA256'];d.health(True);observe('before');d.wait('Enrollment status');d.tap('Check status');d.wait('Your account is approved. Request a new verification code to sign in.');d.archive('actual-approved-enrollment');d.state['phases'].append('ACTUAL_APPROVED_STATUS');d.save();d.tap('Sign in');d.wait('Send OTP');d.adb('shell','am','force-stop',soak.PACKAGE);d.adb('shell','monkey','-p',soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');tree=d.wait('Send OTP');assert not any(n.get('content-desc')=='Orders tab' for n in tree.iter('node'));d.archive('cold-login-after-enrollment-exit');observe('after');d.state.update(status='PASS',phases=['ACTUAL_APPROVED_STATUS','ONE_EXPLICIT_SIGN_IN_CLEARED_ENROLLMENT','COLD_LOGIN_REQUIRED'],completedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat());d.save()
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',failureSite=Path(last.filename).name+':'+str(last.lineno),reason='Enrollment exit stopped; preserve evidence; no OTP or replay');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('{"status":"PASS","scope":"native approval status and explicit enrollment exit"}')
 except Exception:print('{"status":"FAIL","category":"ENROLLMENT_EXIT_STOPPED"}');sys.exit(1)
