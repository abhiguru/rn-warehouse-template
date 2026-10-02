#!/usr/bin/env python3
"""Late genuine Orders reply after entering server selection; no selection/save."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('nav',Path(__file__).with_name('navigation-api30.py'));nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav)
os.umask(0o077)
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main(path):
 c=json.loads(nav.soak.private(path).read_text());assert c['reservedCustomerOrdersSelectionRace'] is True and c['kind']=='native-orders-selection-response-race'
 deadline=datetime.datetime.fromisoformat(c['deadlineUTC'].replace('Z','+00:00')).timestamp();assert 0<deadline-time.time()<=600;scripts=Path(__file__).parent.parent
 cfg,i=nav.soak.config(c['soakConfig']);assert i['serial']=='emulator-5556' and c['artifactSHA256']==cfg['apkSHA256']
 names=['fixture-navigation-observe.mjs','fixture-navigation-guards.mjs','fixture-session-guards.mjs','fixture-orders-race-controls.mjs','fixture-orders-race-verify.mjs','fixture-ui/orders-selection-race-api30.py','fixture-ui/navigation-api30.py','fixture-ui/navigation_controls.py','fixture-ui/soak-api30.py','fixture-ui/dispatch_case_controls.py','fixture-ui/fixture_observation.py','fixture-ui/emulator_offline_network.py','fixture-ui/selection_start_controls.py']
 assert set(c['toolingSHA256'])==set(names) and all(digest(scripts/n)==c['toolingSHA256'][n] for n in names)
 helper=json.loads(nav.soak.private(c['helperConfig']).read_text());assert digest(c['helperConfig'])==c['helperConfigSHA256'];assert len(helper['services'])==1 and helper['services'][0]['ordersReadDelayMs']==5000
 unit='warehouse-fixture-core-'+helper['runId']+'.service';assert cfg['managedUnits']['core']==unit and c['helperLog']==str(Path(helper['logDir'])/(unit+'.log'));nav.soak.private(c['helperLog'])
 for name in ['databaseHelper','httpObserver']:assert digest(cfg[name])==c[name+'SHA256']
 fd=os.open(Path(c['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 e=Path(c['caseDirectory']);assert not e.exists();e.mkdir(mode=0o700)
 class Race(nav.Navigation):
  def adb(self,*args):assert time.time()<deadline,'Race case deadline';return super().adb(*args)
 d=Race(cfg,i,'unused',0);d.e=e;d.file=e/'orders-selection-race-result.json';d.state.update(phases=[],OTPRequested=False,selectionActivated=False);d.save()
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-navigation-observe.mjs'),[path,phase],timeout=25);assert q.returncode==0
 def orders200(since):
  end=time.monotonic()+30
  while True:
   q=d.backend_process(cfg['httpObserver'],[since],timeout=15);v=nav.decode_observation(q.returncode,q.stdout.decode(errors='replace'))
   assert v['status'] in ['PASS','WAIT']
   raw=Path(c['helperLog']).read_text();assert len(raw)<=1048576
   completed=False
   for line in raw.splitlines():
    try:x=json.loads(line)
    except ValueError:continue
    if x.get('event')=='complete' and x.get('method')=='POST' and x.get('path')=='/rest/v1/rpc/get_orders_list' and x.get('status')==200 and datetime.datetime.fromisoformat(x['atUTC'].replace('Z','+00:00'))>=datetime.datetime.fromisoformat(since):completed=True
   if v['status']=='PASS' and completed:return
   assert time.monotonic()<end;time.sleep(.25)
 def delayed_start(since):
  end=time.monotonic()+10
  while True:
   raw=Path(c['helperLog']).read_text();assert len(raw)<=1048576
   events=[]
   for line in raw.splitlines():
    try:x=json.loads(line)
    except ValueError:continue
    if x.get('event')=='orders-delay-start' and x.get('method')=='POST' and x.get('path')=='/rest/v1/rpc/get_orders_list' and datetime.datetime.fromisoformat(x['atUTC'].replace('Z','+00:00'))>=datetime.datetime.fromisoformat(since):events.append(x)
   if events:assert len(events)==1 and events[0]['status']==200 and events[0]['delayMs']==5000;return
   assert time.monotonic()<end;time.sleep(.05)
 try:
  observe('guard');assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';assert d.adb('shell','getenforce')=='Enforcing'
  p=d.adb('shell','pm','path',nav.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p);assert d.adb('shell','sha256sum',p[8:]).split()[0]==c['artifactSHA256'];nav.owned_reverse_route(d.adb('reverse','--list'),18443)
  since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.cold();d.wait('Orders tab');orders200(since);observe('before')
  since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');delayed_start(since)
  d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://operator-server','-p',nav.soak.PACKAGE);tree=d.wait('Choose your warehouse server');entered=datetime.datetime.now(datetime.timezone.utc).isoformat()
  for n in tree.iter('node'):
   for key in ['text','content-desc']:n.set(key,re.sub(r'\b(?:91)?\d{10}\b','[private phone]',n.get(key,'')))
  raw=nav.ET.tostring(tree,encoding='unicode');assert len(raw)<=1048576
  with (e/'actual-selection-screen.xml').open('x') as f:f.write(raw)
  with (e/'race-screen.json').open('x') as f:f.write(json.dumps({'selectionScreenVisible':True,'requestSinceUTC':since,'selectionEnteredUTC':entered})+'\n')
  orders200(since);q=d.backend_process(str(scripts/'fixture-orders-race-verify.mjs'),[path],timeout=15);assert q.returncode==0,'Actual pending-request timing not proven';timeline=json.loads(q.stdout)
  with (e/'race-timeline.json').open('x') as f:f.write(json.dumps(timeline)+'\n')
  for _ in range(2):
   labels=nav.labels(d.wait('Choose your warehouse server'));assert 'Orders tab' not in labels and 'Server Unavailable' not in labels;time.sleep(.5)
  d.selected_server(e,c['origin'],c['instanceId']);since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.cold();d.wait('Orders tab');orders200(since);observe('after')
  d.state.update(status='PASS',lateOrdersResponseSelectionPreserved=True,normalRouteColdOrders200=True,scope='late Orders response after entering selection only; confirmed switching separate');d.save();print('{"status":"PASS","scope":"late genuine Orders response on selection screen"}')
 except Exception as error:d.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Preserve race attempt; no automatic retry or selection');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:main(str(Path(sys.argv[1]).resolve()))
 except Exception:print('{"status":"FAIL","category":"ORDERS_SELECTION_RACE_STOPPED"}');sys.exit(1)
