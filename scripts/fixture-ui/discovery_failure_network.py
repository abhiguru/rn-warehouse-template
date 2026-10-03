"""Narrow switching-host outage for the owned fixture app; no radio changes."""
import re

MARKER='whvm-discovery-0109-01'
def rule(uid,marker):
    assert isinstance(uid,str) and re.fullmatch(r'10\d{3}',uid),'Exact Android application UID required'
    assert marker==MARKER,'One reserved discovery attempt only'
    return ['-p','tcp','-d','10.0.2.2','--dport','443','-m','owner','--uid-owner',uid,'-m','comment','--comment',marker,'-j','REJECT']

def reject_switching(adb,uid,marker):
    args=rule(uid,marker)
    assert adb('shell','id','-u')=='0','Existing owned emulator root required'
    hosts=adb('shell','cat','/etc/hosts')
    assert '10.0.2.2 backend-switch.example.test' in hosts.splitlines()
    assert '127.0.0.1 backend-core.example.test' in hosts.splitlines()
    assert marker not in adb('shell','iptables','-S','OUTPUT'),'Do not overwrite existing rule'
    adb('shell','iptables','-I','OUTPUT','1',*args)
    assert marker in adb('shell','iptables','-S','OUTPUT')

def restore_switching(adb,uid,marker):
    args=rule(uid,marker)
    adb('shell','iptables','-C','OUTPUT',*args)
    adb('shell','iptables','-D','OUTPUT',*args)
    assert marker not in adb('shell','iptables','-S','OUTPUT'),'Owned switching rule still present'

def matched_switching_packets(output,uid,marker):
    rule(uid,marker)
    assert isinstance(output,str) and len(output)<=65536,'Bounded rule counters required'
    rows=[line for line in output.splitlines() if marker in line]
    assert len(rows)==1,'Exact owned rejection counter required'
    row=rows[0];parts=row.split();assert len(parts)>=10
    assert parts[2:4]==['REJECT','tcp'] and parts[8]=='10.0.2.2'
    assert 'dpt:443' in parts and re.search(r'owner UID match '+re.escape(uid)+r'\b',row)
    assert parts[0].isdigit() and parts[1].isdigit() and int(parts[0])>0,'Actual switching packet rejection required'
    return {'packets':int(parts[0]),'bytes':int(parts[1])}
