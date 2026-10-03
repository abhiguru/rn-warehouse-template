#!/usr/bin/env python3
"""One real unsaved invoice form through cancelled discovery; no submission."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,subprocess,sys,time
from pathlib import Path
from unsaved_invoice_controls import invoice_number_point
spec=importlib.util.spec_from_file_location('nav',Path(__file__).with_name('navigation-api30.py'));nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav)
os.umask(0o077)
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main(path):
 c=json.loads(nav.soak.private(path).read_text());assert c['case']=='unsaved-invoice-draft-cancel';assert c['kind']=='native-unsaved-invoice-draft'
 deadline=datetime.datetime.fromisoformat(c['deadlineUTC'].replace('Z','+00:00')).timestamp();assert 0<deadline-time.time()<=600
 scripts=Path(__file__).parent.parent;ui=json.loads(nav.soak.private(c['soakConfig']).read_text())
 q=subprocess.run([ui['node'],str(scripts/'fixture-navigation-observe.mjs'),path,'guard'],capture_output=True,timeout=25);assert q.returncode==0
 cfg,i=nav.soak.config(c['soakConfig']);assert c['artifactSHA256']==cfg['apkSHA256'];assert i['serial']=='emulator-5556'
 names=['fixture-navigation-observe.mjs','fixture-navigation-guards.mjs','fixture-session-guards.mjs','fixture-ui/unsaved-invoice-draft-api30.py','fixture-ui/unsaved_invoice_controls.py','fixture-ui/navigation-api30.py','fixture-ui/navigation_controls.py','fixture-ui/soak-api30.py','fixture-ui/dispatch_case_controls.py','fixture-ui/fixture_observation.py','fixture-ui/emulator_offline_network.py','fixture-ui/selection_start_controls.py']
 assert set(c['toolingSHA256'])==set(names);assert all(c['toolingSHA256'][n]==digest(scripts/n) for n in names)
 for n in ['databaseHelper','httpObserver']:assert c[n+'SHA256']==digest(cfg[n])
 fd=os.open(Path(c['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 e=Path(c['caseDirectory']);assert not e.exists();e.mkdir(mode=0o700)
 class Draft(nav.Navigation):
  def archive(self,label):
   assert label in ['actual-owned-unsaved-invoice-number','unsaved-invoice-number-retained-after-cancel']
   tree=self.snapshot()
   for n in tree.iter('node'):
    for key in ['text','content-desc']:
     value=n.get(key,'');value=re.sub(r'\b(?:91)?\d{10}\b','[private phone]',value);n.set(key,value)
   raw=nav.ET.tostring(tree,encoding='unicode');assert len(raw)<=1048576
   with (self.e/(label+'.xml')).open('x') as f:f.write(raw)
  def adb(self,*args):
   assert time.time()<deadline,'Stop at the draft deadline';return super().adb(*args)
 d=Draft(cfg,i,'unused',0);d.e=e;d.file=e/'unsaved-invoice-draft-result.json';d.state.update(phases=[],businessSubmitAttempted=False,otpRequested=False,configSHA256=digest(path));d.save()
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-navigation-observe.mjs'),[path,phase],timeout=25);assert q.returncode==0
 def open_route(route):d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://'+route,'-p',nav.soak.PACKAGE)
 def draft_present():
  nodes=[n for n in d.snapshot().iter('node') if n.get('class')=='android.widget.EditText' and n.get('text')==c['draftMarker']];assert len(nodes)==1,'Exact unsaved invoice number must remain'
 try:
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';assert d.adb('shell','getenforce')=='Enforcing'
  p=d.adb('shell','pm','path',nav.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p);assert d.adb('shell','sha256sum',p[8:]).split()[0]==c['artifactSHA256'];nav.owned_reverse_route(d.adb('reverse','--list'),18443);d.health(True);observe('before');d.cold();d.wait('Orders tab')
  open_route('invoice-form/step1');tree=d.wait('Auto-generated, can be edited');x,y,old=invoice_number_point(tree);d.adb('shell','input','tap',str(x),str(y));d.adb('shell','input','keyevent','123')
  for _ in old:d.adb('shell','input','keyevent','67')
  d.adb('shell','input','text',c['draftMarker']);draft_present()
  if 'mInputShown=true' in d.adb('shell','dumpsys','input_method'):d.adb('shell','input','keyevent','4')
  draft_present();d.archive('actual-owned-unsaved-invoice-number');d.state['phases'].append('REAL_UNSAVED_INVOICE_NUMBER_WITHOUT_SUBMISSION');d.save()
  open_route('operator-server');d.wait('Choose your warehouse server');d.fill_origin(c['targetOrigin']);d.tap('Check server');d.wait('Fictional Switching Warehouse');d.wait(c['targetOrigin']);d.tap('Use this server');d.wait('Change Warehouse Server');d.tap('CANCEL');d.wait('Choose your warehouse server');d.adb('shell','input','keyevent','4')
  for _ in range(2):draft_present();time.sleep(.5)
  d.archive('unsaved-invoice-number-retained-after-cancel');d.state['phases'].append('GENUINE_DIFFERENT_INSTANCE_CANCEL_RETAINS_REAL_DRAFT');d.save();d.selected_server(e,c['origin'],c['instanceId'])
  # Only the case's local unsaved marker is cleared by the normal cold restart.
  d.cold();d.wait('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');d.wait('Backend Test Customer A');end=time.monotonic()+25
  while True:
   q=d.backend_process(cfg['httpObserver'],[since],timeout=15);v=nav.decode_observation(q.returncode,q.stdout.decode(errors='replace'))
   if v['status']=='PASS':break
   assert v['status']=='WAIT' and time.monotonic()<end;time.sleep(.5)
  observe('after');d.state.update(status='PASS',normalRouteColdOrders200=True,cleanup='Owned unsaved in-memory form abandoned by cold restart; no submit',scope='invoice-header draft cancellation only; other drafts/in-flight operations separate');d.save();print('{"status":"PASS","scope":"one real unsaved invoice form cancellation"}')
 except Exception as error:d.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Preserve unsaved draft and evidence; no submission, replay or automatic cleanup');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(str(Path(sys.argv[1]).resolve()))
 except Exception:print('{"status":"FAIL","category":"UNSAVED_INVOICE_DRAFT_STOPPED"}');sys.exit(1)
