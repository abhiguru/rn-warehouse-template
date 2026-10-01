"""Owned API30 airplane state and one fixture-UID loopback rule, never broad reset."""
import re,shlex,time

def owned(adb):
    assert adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30'
    assert adb('shell','getprop','ro.build.version.sdk')=='30'
    assert adb('shell','id','-u')=='0'

def original_airplane(adb):
    owned(adb);value=adb('shell','settings','get','global','airplane_mode_on')
    assert value=='0','Require ordinary connected owned emulator airplane state'
    return value

def airplane(adb,expected,desired):
    assert (expected,desired) in [('0','1'),('1','0')]
    owned(adb);assert adb('shell','settings','get','global','airplane_mode_on')==expected
    adb('shell','cmd','connectivity','airplane-mode','enable' if desired=='1' else 'disable')
    assert adb('shell','settings','get','global','airplane_mode_on')==desired

def disconnected(adb,seconds=30):
    assert 1<=seconds<=30;end=time.monotonic()+seconds;stable=0;last=''
    while time.monotonic()<end:
        last=adb('shell','dumpsys','connectivity');assert len(last)<=65536
        lines=[x.strip() for x in last.splitlines() if x.startswith('Active default network:')]
        stable=stable+1 if lines==['Active default network: none'] else 0
        if stable>=2:return last
        time.sleep(.5)
    raise AssertionError('Actual Android device disconnection not established')

def rule(uid,marker):
    assert isinstance(uid,int) and 10000<=uid<=19999
    assert re.fullmatch(r'whvm-offline-0106-0[23]',marker)
    return ['-m','owner','--uid-owner',str(uid),'-d','127.0.0.1/32','-p','tcp','--dport','443','-m','comment','--comment',marker,'-j','REJECT','--reject-with','tcp-reset']

def reject_fixture_loopback(adb,uid,marker):
    args=rule(uid,marker);owned(adb);assert marker not in adb('shell','iptables','-S','OUTPUT')
    adb('shell','iptables','-I','OUTPUT','1',*args)
    assert len([x for x in adb('shell','iptables','-S','OUTPUT').splitlines() if marker in x])==1

def restore_fixture_loopback(adb,uid,marker):
    args=rule(uid,marker);owned(adb);rows=[x for x in adb('shell','iptables','-S','OUTPUT').splitlines() if marker in x]
    assert len(rows)==1,'Exact owned offline rule required; no broad table restore'
    tokens=shlex.split(rows[0]);assert tokens[:2]==['-A','OUTPUT']
    for key,value in [('--uid-owner',str(uid)),('-d','127.0.0.1/32'),('-p','tcp'),('--dport','443'),('--comment',marker),('-j','REJECT'),('--reject-with','tcp-reset')]:
        assert tokens.count(key)==1 and tokens[tokens.index(key)+1]==value,'Offline rule ownership changed'
    adb('shell','iptables','-D','OUTPUT',*args)
    assert marker not in adb('shell','iptables','-S','OUTPUT')
