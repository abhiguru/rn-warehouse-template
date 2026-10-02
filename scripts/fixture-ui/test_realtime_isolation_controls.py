import unittest,xml.etree.ElementTree as ET,datetime
from realtime_isolation_controls import own_card,fresh_trigger
class Controls(unittest.TestCase):
 def tree(self,label):return ET.fromstring('<hierarchy><node content-desc="Orders tab"/><node content-desc="'+label+'" enabled="true" bounds="[0,100][720,300]"/></hierarchy>')
 def test_reciprocal_card(self):
  self.assertIn('Customer B',own_card(self.tree('Order for Backend Test Customer B, Empty, No items yet')))
  with self.assertRaises(AssertionError):own_card(self.tree('Order for Backend Test Customer A, Empty, No items yet'))
  t=self.tree('Order for Backend Test Customer B, Empty, No items yet');ET.SubElement(t,'node',{'text':'Backend Test Customer A'})
  with self.assertRaises(AssertionError):own_card(t)
 def test_bounded_trigger(self):
  now=datetime.datetime.now(datetime.timezone.utc);fresh_trigger(now.isoformat(),now)
  with self.assertRaises(AssertionError):fresh_trigger((now-datetime.timedelta(seconds=121)).isoformat(),now)
  with self.assertRaises(AssertionError):fresh_trigger((now+datetime.timedelta(seconds=1)).isoformat(),now)
if __name__=='__main__':unittest.main()
