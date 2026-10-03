import unittest,xml.etree.ElementTree as ET
from logout_controls import confirm_point,MESSAGE,avatar_point
class Controls(unittest.TestCase):
 def tree(self,extra=''):
  return ET.fromstring('<hierarchy><node clickable="true" enabled="true" bounds="[0,0][720,1280]"><node text="'+MESSAGE+'"/><node text="Sign Out"/><node text="Cancel"/><node clickable="true" enabled="true" bounds="[400,700][600,780]"><node text="Sign Out"/></node>'+extra+'</node></hierarchy>')
 def test_confirmation(self):self.assertEqual(confirm_point(self.tree()),(500,740))
 def test_duplicate(self):
  with self.assertRaises(AssertionError):confirm_point(self.tree('<node text="Sign Out" clickable="true" enabled="true" bounds="[100,700][300,780]"/>'))
 def test_missing_message(self):
  with self.assertRaises(AssertionError):confirm_point(ET.fromstring('<hierarchy><node text="Delete Account"/></hierarchy>'))
 def test_avatar(self):
  node='<node content-desc="C" clickable="true" enabled="true" class="android.view.ViewGroup" bounds="[616,75][693,138]"/>'
  self.assertEqual(avatar_point(ET.fromstring('<hierarchy>'+node+'</hierarchy>'),'C'),(654,106))
  for invalid in [node+node,node.replace('enabled="true"','enabled="false"'),node.replace('[616,75][693,138]','[0,0][720,1280]')]:
   with self.assertRaises(AssertionError):avatar_point(ET.fromstring('<hierarchy>'+invalid+'</hierarchy>'),'C')
if __name__=='__main__':unittest.main()
