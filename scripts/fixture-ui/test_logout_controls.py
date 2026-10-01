import unittest,xml.etree.ElementTree as ET
from logout_controls import confirm_point,MESSAGE
class Controls(unittest.TestCase):
 def tree(self,extra=''):
  return ET.fromstring('<hierarchy><node clickable="true" enabled="true" bounds="[0,0][720,1280]"><node text="'+MESSAGE+'"/><node text="Sign Out"/><node text="Cancel"/><node clickable="true" enabled="true" bounds="[400,700][600,780]"><node text="Sign Out"/></node>'+extra+'</node></hierarchy>')
 def test_confirmation(self):self.assertEqual(confirm_point(self.tree()),(500,740))
 def test_duplicate(self):
  with self.assertRaises(AssertionError):confirm_point(self.tree('<node text="Sign Out" clickable="true" enabled="true" bounds="[100,700][300,780]"/>'))
 def test_missing_message(self):
  with self.assertRaises(AssertionError):confirm_point(ET.fromstring('<hierarchy><node text="Delete Account"/></hierarchy>'))
if __name__=='__main__':unittest.main()
