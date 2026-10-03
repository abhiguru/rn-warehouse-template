"""Dedicated expiry helper lifecycle; no replacement, restart or authentication."""
import json,re,socket,ssl
from pathlib import Path

def helper_config(c,private,digest):
 h=c['appointmentHelper'];assert re.fullmatch(r'warehouse-fixture-core-expiry-[a-z0-9-]+\.service',h['unit'])
 assert c['primaryUnit']==h['unit'] and h['unit']!=c['emulatorUnit']
 bound={x['path']:x['sha256'] for x in c['bindings']}
 for key in ['configuration','fragment','certificate','healthSource']:
  p=private(h[key]);assert bound[str(p)]==digest(p)
 cfg=json.loads(private(h['configuration']).read_text());assert cfg['scope']=='isolated-fictional-fixture' and len(cfg['services'])==1
 s=cfg['services'][0];assert s['kind']=='core' and s['owningCheckout']==c['backendCheckout'] and s['state']==c['backendState'] and s['ownerGuardSHA256']==c['fixtureGuardSHA256']
 assert not s.get('replacementAuthentication') and not s.get('dispatchConcurrency')
 for key in ['ordersReadDelayMs','discoveryDelayMs','confirmedOrdersReadDelayMs']:assert s.get(key,0)==0
 assert h['ipc']==s['socketPath'] and h['certificate']==c['certificate']
 return h

def helper_state(text,h,inactive):
 p=dict(x.split('=',1) for x in text.splitlines())
 assert p['Restart']=='no' and p['NRestarts']=='0' and p['KillMode']=='control-group' and p['RuntimeMaxUSec']=='1h'
 assert p['FragmentPath']==h['fragment'] and h['configuration'] in p['ExecStart'] and h['healthSource'] in p['ExecStart']
 assert p['ActiveState']==('inactive' if inactive else 'active')
 if not inactive:assert p['SubState']=='running' and int(p['MainPID'])>0
 return p

def inspect_helper(run,h,inactive):
 return helper_state(run(['systemctl','--user','show',h['unit'],'-p','ActiveState','-p','SubState','-p','MainPID','-p','Restart','-p','NRestarts','-p','KillMode','-p','RuntimeMaxUSec','-p','FragmentPath','-p','ExecStart']),h,inactive)

def free_helper_endpoints(h):
 assert not Path(h['ipc']).exists()
 with socket.socket() as s:s.bind(('127.0.0.1',18443))

def helper_ready(h,instance):
 context=ssl.create_default_context(cafile=h['certificate'])
 with socket.create_connection(('127.0.0.1',18443),timeout=3) as tcp:
  with context.wrap_socket(tcp,server_hostname='backend-core.example.test') as tls:
   tls.sendall(b'GET /functions/v1/get-public-config HTTP/1.1\r\nHost: backend-core.example.test\r\nConnection: close\r\n\r\n');data=b''
   while True:
    part=tls.recv(4096)
    if not part:break
    data+=part;assert len(data)<=65536
   assert re.match(rb'HTTP/1\.[01] 200\b',data) and instance.encode() in data
 with socket.socket(socket.AF_UNIX) as ipc:ipc.settimeout(3);ipc.connect(h['ipc'])
 return True
