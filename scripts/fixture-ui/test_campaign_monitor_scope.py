import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('monitor',Path(__file__).parent.parent/'fixture-campaign-monitor.py');monitor=importlib.util.module_from_spec(spec);spec.loader.exec_module(monitor)
class Scope(unittest.TestCase):
 def test_101st_stage_is_included_without_truncation(self):
  paths=[Path('/owned/stage-%03d.json'%n) for n in range(101)];self.assertEqual(monitor.bounded_paths(reversed(paths)),paths)
 def test_limit_is_explicit_and_excess_refuses(self):
  self.assertEqual(len(monitor.bounded_paths([Path('/owned/%03d'%n) for n in range(256)])),256)
  with self.assertRaisesRegex(AssertionError,'MONITOR_SCOPE_LIMIT_EXCEEDED'):monitor.bounded_paths(Path('/owned/%03d'%n) for n in range(257))
 def test_active_or_locked_actor_is_never_historical(self):
  self.assertFalse(monitor.terminal_plan({'steps':[{'status':'RUNNING'}]},False));self.assertFalse(monitor.terminal_plan({'steps':[{'status':'PASS'}]},True));self.assertFalse(monitor.terminal_plan({'steps':[],'checks':[{'status':'PASS'}]},False))
if __name__=='__main__':unittest.main()
