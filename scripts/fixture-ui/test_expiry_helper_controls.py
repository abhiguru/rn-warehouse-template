import unittest
from expiry_helper_controls import helper_state
class HelperStateTests(unittest.TestCase):
 def setUp(self):
  self.h={'fragment':'/private/expiry.service','configuration':'/private/expiry.json','healthSource':'/private/scripts/emulator-fixture-bridge.mjs','checkout':'/private','environment':{'WAREHOUSE_STATE_DIR':'/private/state'}}
  self.props={'Restart':'no','NRestarts':'0','KillMode':'control-group','RuntimeMaxUSec':'1h','FragmentPath':self.h['fragment'],'ExecStart':'node '+self.h['healthSource']+' '+self.h['configuration'],'ActiveState':'inactive','SubState':'dead','MainPID':'0','DropInPaths':'','WorkingDirectory':'/private','Environment':'WAREHOUSE_STATE_DIR=/private/state'}
 def text(self,p):return '\n'.join(k+'='+v for k,v in p.items())
 def test_refuses_competing_helper_restart_caps_and_changed_binding(self):
  helper_state(self.text(self.props),self.h,True)
  for patch in [{'ActiveState':'active'},{'Restart':'always'},{'NRestarts':'1'},{'RuntimeMaxUSec':'12h'},{'FragmentPath':'/unrelated/service'},{'ExecStart':'node /unrelated/config'},{'KillMode':'process'},{'DropInPaths':'/unbound/override.conf'},{'Environment':'WAREHOUSE_STATE_DIR=/foreign'},{'Environment':'WAREHOUSE_STATE_DIR=/private/state WAREHOUSE_FIXTURE_REPLACEMENT_AUTH=true'}]:
   with self.assertRaises(AssertionError):helper_state(self.text({**self.props,**patch}),self.h,True)
 def test_requires_actual_supervised_pid_for_readiness(self):
  active={**self.props,'ActiveState':'active','SubState':'running','MainPID':'123'};helper_state(self.text(active),self.h,False)
  for patch in [{'MainPID':'0','DropInPaths':'','WorkingDirectory':'/private','Environment':'WAREHOUSE_STATE_DIR=/private/state'},{'SubState':'exited'},{'NRestarts':'1'}]:
   with self.assertRaises(AssertionError):helper_state(self.text({**active,**patch}),self.h,False)
