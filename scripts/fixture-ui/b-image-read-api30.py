#!/usr/bin/env python3
"""One authorized B image render; no upload, OTP or business write."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,subprocess,sys,time
from pathlib import Path
from b_image_render_controls import checkerboard_png
spec=importlib.util.spec_from_file_location('nav',Path(__file__).with_name('navigation-api30.py'));nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav)
os.umask(0o077)
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main(path):
 c=json.loads(nav.soak.private(path).read_text());scripts=Path(__file__).parent.parent;ui=json.loads(nav.soak.private(c['soakConfig']).read_text());deadline=datetime.datetime.fromisoformat(c['deadlineUTC'].replace('Z','+00:00')).timestamp();assert 0<deadline-time.time()<=600
 names=['fixture-b-native-image-observe.mjs','fixture-b-native-image-controls.mjs','fixture-navigation-guards.mjs','fixture-session-guards.mjs','fixture-ui/b-image-read-api30.py','fixture-ui/b_image_render_controls.py','fixture-ui/navigation-api30.py','fixture-ui/navigation_controls.py','fixture-ui/soak-api30.py','fixture-ui/dispatch_case_controls.py','fixture-ui/fixture_observation.py','fixture-ui/emulator_offline_network.py','fixture-ui/selection_start_controls.py','fixture-soak-preflight.mjs','prepare-emulator-fixture.mjs','fixture-service-health.mjs','is-main.mjs']
 assert set(c['toolingSHA256'])==set(names);assert all(c['toolingSHA256'][n]==digest(scripts/n) for n in names)
 q=subprocess.run([ui['node'],str(scripts/'fixture-b-native-image-observe.mjs'),path,'guard'],capture_output=True,timeout=25);assert q.returncode==0
 cfg,i=nav.soak.config(c['soakConfig']);assert i['serial']=='emulator-5556';assert c['artifactSHA256']==cfg['apkSHA256']
 for n in ['databaseHelper','httpObserver']:assert c[n+'SHA256']==digest(cfg[n])
 fd=os.open(Path(c['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 class ImageRead(nav.Navigation):
  def adb(self,*args):assert time.time()<deadline;return super().adb(*args)
 d=ImageRead(cfg,i,'unused',0);e=Path(c['caseDirectory']);assert not e.exists();e.mkdir(mode=0o700);d.e=e;d.file=e/'b-image-native-result.json';d.state.update(phases=[],imageReadAttempted=False,otpRequested=False,uploadAttempted=False);d.save()
 def observe(phase,since=None):
  q=d.backend_process(str(scripts/'fixture-b-native-image-observe.mjs'),[path,phase]+([since] if since else []),timeout=25);assert q.returncode in ([0,3] if phase=='http' else [0]);return json.loads(q.stdout)
 try:
  q=d.backend_process(str(scripts/'fixture-soak-preflight.mjs'),[c['soakConfig']],timeout=45);assert q.returncode==0
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';assert d.adb('shell','getenforce')=='Enforcing'
  p=d.adb('shell','pm','path',nav.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p);assert d.adb('shell','sha256sum',p[8:]).split()[0]==c['artifactSHA256'];nav.owned_reverse_route(d.adb('reverse','--list'),18443);d.health(True);observe('before')
  d.cold();d.wait('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.state['imageReadAttempted']=True;d.save();d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://grn-details/'+c['targetReceiptId'],'-p',nav.soak.PACKAGE)
  d.wait('Images');d.tap('Images');d.wait('All (1)');d.wait('Header (1)');d.wait('Items (0)');d.archive('authorized-B-images-tab')
  end=time.monotonic()+30
  while observe('http',since)['status']!='PASS':assert time.monotonic()<end;time.sleep(.5)
  captures=[]
  for number in [1,2]:
   d.health();q=subprocess.run([cfg['adb'],'-s',i['serial'],'exec-out','screencap','-p'],capture_output=True,timeout=15);assert q.returncode==0;result=checkerboard_png(q.stdout);result['sha256']=hashlib.sha256(q.stdout).hexdigest();captures.append(result)
   with (e/('B-image-render-'+str(number)+'.png')).open('xb') as f:f.write(q.stdout)
   time.sleep(.5)
  assert captures[0]['bounds']==captures[1]['bounds'];(e/'B-image-render-proof.json').write_text(json.dumps({'status':'PASS','captures':captures,'freshSignedImageGET200':True,'fixtureSHA256':c['imageSHA256']})+'\n');d.state['phases'].append('ACTUAL_B_IMAGE_GET_AND_TWO_CHECKERBOARD_RENDERS');d.save();d.selected_server(e,c['origin'],c['instanceId'])
  d.cold();d.wait('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');d.wait('Backend Test Customer B');end=time.monotonic()+25
  while True:
   q=d.backend_process(cfg['httpObserver'],[since],timeout=15);v=nav.decode_observation(q.returncode,q.stdout.decode(errors='replace'))
   if v['status']=='PASS':break
   assert v['status']=='WAIT' and time.monotonic()<end;time.sleep(.5)
  observe('after');d.state.update(status='PASS',normalRouteColdOrders200=True,scope='authorized native B image rendering only; upload and reciprocal denial separate');d.save();print('{"status":"PASS","scope":"authorized native B image rendering only"}')
 except Exception as error:d.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Preserve evidence and state; no upload, login, replay or automatic cleanup');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(str(Path(sys.argv[1]).resolve()))
 except Exception:print('{"status":"FAIL","category":"B_NATIVE_IMAGE_READ_STOPPED"}');sys.exit(1)
