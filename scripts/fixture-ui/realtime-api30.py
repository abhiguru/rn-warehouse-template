#!/usr/bin/env python3
"""One bounded owned native actor; trigger tokens live only in the Node parent."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,select,shlex,subprocess,sys,time
from pathlib import Path
from fixture_observation import decode_observation
from navigation_controls import settings,disconnect,reconnect
from emulator_offline_network import original_airplane,airplane,disconnected,reject_fixture_loopback,restore_fixture_loopback
from dispatch_case_controls import owned_reverse_route
from realtime_controls import card,committed
spec=importlib.util.spec_from_file_location('navigation',Path(__file__).with_name('navigation-api30.py'))
nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav)
os.umask(0o077)
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def emit(value):print(json.dumps(value),flush=True)
def receive(phase):
    ready,_,_=select.select([sys.stdin],[],[],90)
    assert ready,'Bounded parent commit timeout; no native retry'
    raw=sys.stdin.readline(2049);assert raw.endswith('\n') and len(raw)<=2048
    value=json.loads(raw);return committed(value,phase)
def main(path):
    case=json.loads(nav.soak.private(path).read_text());scripts=Path(__file__).parent.parent
    ui=json.loads(nav.soak.private(case['soakConfig']).read_text())
    guard=subprocess.run([ui['node'],str(scripts/'fixture-realtime-preflight.mjs'),path],capture_output=True,timeout=20)
    assert guard.returncode==0 and json.loads(guard.stdout)=={'status':'PASS','scope':'realtime-release-guard'}
    c,inputs=nav.soak.config(case['soakConfig']);assert case['artifactSHA256']==c['apkSHA256']
    names=['fixture-realtime-preflight.mjs','fixture-realtime-controls.mjs','fixture-session-guards.mjs','fixture-ui/realtime-api30.py','fixture-ui/realtime_controls.py','fixture-ui/navigation-api30.py','fixture-ui/navigation_controls.py','fixture-ui/soak-api30.py','fixture-ui/emulator_offline_network.py','fixture-ui/dispatch_case_controls.py','fixture-ui/fixture_observation.py','fixture-ui/selection_start_controls.py']
    assert all(case['toolingSHA256'].get(n)==digest(scripts/n) for n in names),'Frozen native tooling changed'
    for name in ['databaseHelper','httpObserver']:assert digest(c[name])==case[name+'SHA256']
    fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    evidence=nav.soak.private(case['caseDirectory'],True)/'native';evidence.mkdir(mode=0o700)
    driver=nav.Navigation(c,inputs,'unused',0);driver.e=evidence;driver.file=evidence/'result.json'
    driver.state.update(phases=[],manualRefreshDuringObservation=False,configSHA256=digest(path));driver.save()
    rule_attempted=plane_attempted=network_attempted=False;radios=None;uid=None
    attempt=Path(case['caseDirectory']).name[-2:];assert attempt in ['01','02','03'];marker='whvm-realtime-0109-'+attempt
    def orders_http(since):
        result=driver.backend_process(c['httpObserver'],[since],timeout=20)
        value=decode_observation(result.returncode,result.stdout.decode(errors='replace'))
        assert value['status'] in ['PASS','WAIT'],'Independent Orders observer refused'
        return value['status']=='PASS'
    def delivered(phase):
        since=receive(phase);end=time.monotonic()+60;label=None
        while time.monotonic()<end:
            tree=driver.snapshot()
            try:label=card(tree,1 if phase=='added' else 2)
            except AssertionError:label=None
            if label and orders_http(since):break
            time.sleep(1)
        else:raise AssertionError('No native Realtime card plus fresh Orders200; no refresh or replay')
        (evidence/(phase+'-native-card.json')).write_text(json.dumps({'label':label,'freshOrders200':True,'manualRefreshUsed':False,'since':since})+'\n')
        driver.state['phases'].append(phase.upper()+'_NATIVE_CARD_AND_ORDERS200');driver.save()
        emit({'status':'DELIVERED','phase':phase,'manualRefreshUsed':False})
    try:
        assert inputs['serial']=='emulator-5556'
        assert driver.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30'
        assert driver.adb('shell','getprop','ro.build.version.sdk')=='30'
        assert driver.adb('shell','getenforce')=='Enforcing'
        package=driver.adb('shell','pm','path',nav.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',package)
        assert driver.adb('shell','sha256sum',package[8:]).split()[0]==c['apkSHA256']
        owned_reverse_route(driver.adb('reverse','--list'),18443);driver.health(True)
        driver.wait('Orders tab');driver.selected_server(evidence,'https://backend-core.example.test',case['instanceId'])
        since=datetime.datetime.now(datetime.timezone.utc).isoformat();driver.tap('Refresh orders')
        end=time.monotonic()+30
        while not orders_http(since):assert time.monotonic()<end;time.sleep(1)
        # Baseline is fetched before the no-refresh delivery windows begin.
        card(driver.snapshot(),0)
        emit({'status':'READY','window':'foreground','manualRefreshUsed':False});delivered('added')
        radios=settings(driver.adb);original_airplane(driver.adb)
        match=re.fullmatch(r'package:in\.gurucold\.warehouse\.fixture uid:(\d+)',driver.adb('shell','pm','list','packages','-U',nav.soak.PACKAGE));assert match;uid=int(match.group(1))
        driver.state.update(originalRadios=radios,originalAirplane='0',ownedRule=marker,offlineFixtureUID=uid);driver.save()
        network_attempted=True;disconnect(driver.adb,radios,18443)
        plane_attempted=True;airplane(driver.adb,'0','1')
        rule_attempted=True;reject_fixture_loopback(driver.adb,uid,marker)
        (evidence/'actual-disconnection.txt').write_text(disconnected(driver.adb));driver.wait('No internet connection')
        restore_fixture_loopback(driver.adb,uid,marker);rule_attempted=False
        airplane(driver.adb,'1','0');plane_attempted=False
        reconnect(driver.adb,radios,18443);network_attempted=False
        end=time.monotonic()+30
        while 'No internet connection' in nav.labels(driver.snapshot()):assert time.monotonic()<end;time.sleep(1)
        # Wait for existing subscription to reconnect; do not force a screen refresh.
        time.sleep(5);card(driver.snapshot(),1);owned_reverse_route(driver.adb('reverse','--list'),18443)
        emit({'status':'READY','window':'reconnected','manualRefreshUsed':False,'ownedNetworkRestored':True});delivered('edited')
        driver.state['status']='PASS';driver.save();emit({'status':'PASS','scope':'native-realtime-foreground-and-reconnect'})
    except Exception as error:
        driver.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Native Realtime stopped; preserve attempts and reconcile, no automatic replay');driver.save();emit({'status':'FAIL','category':'NATIVE_REALTIME_STOPPED'});raise
    finally:
        if rule_attempted:
            restore_fixture_loopback(driver.adb,uid,marker);rule_attempted=False
        if plane_attempted:
            airplane(driver.adb,'1','0');plane_attempted=False
        if network_attempted:
            reconnect(driver.adb,radios,18443);network_attempted=False
        driver.state['ownedNetworkRestored']=not any([rule_attempted,plane_attempted,network_attempted])
        owned_reverse_route(driver.adb('reverse','--list'),18443);driver.save();os.close(fd)
if __name__=='__main__':
    try:main(str(Path(sys.argv[1]).resolve()))
    except Exception:sys.exit(1)
