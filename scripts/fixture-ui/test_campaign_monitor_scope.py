import datetime,importlib.util,unittest
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
 def test_extension_keeps_original_campaign_and_requires_bounded_window(self):
  campaign={'startedAt':'2026-10-01T16:27:13+00:00','deadline':'2026-10-03T16:27:13+00:00'}
  extension={'scope':'authorized-vm-campaign-extension','supersedesDeadline':campaign['deadline'],'authorizationSHA256':'a'*64,'startedAt':'2026-10-03T17:00:00+00:00','deadline':'2026-10-04T05:00:00+00:00'}
  now=datetime.datetime.fromisoformat('2026-10-03T18:00:00+00:00')
  self.assertEqual(monitor.monitor_deadline(campaign).isoformat(),campaign['deadline'])
  self.assertEqual(monitor.monitor_deadline(campaign,extension,now).isoformat(),extension['deadline'])
  for change in [{'scope':'other'},{'supersedesDeadline':'other'},{'authorizationSHA256':'bad'},{'deadline':'2026-10-05T05:00:00+00:00'},{'deadline':'2026-10-03T17:30:00+00:00'},{'startedAt':'2026-10-03T19:00:00+00:00'},{'startedAt':'2026-10-03T17:00:00'}]:
   with self.assertRaises(AssertionError):monitor.monitor_deadline(campaign,{**extension,**change},now)
if __name__=='__main__':unittest.main()
