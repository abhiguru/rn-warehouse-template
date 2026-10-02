import unittest,xml.etree.ElementTree as ET
from cart_controls import point
class Controls(unittest.TestCase):
 def tree(self,extra='',enabled='true',bounds='[100,200][200,300]'):
  return ET.fromstring('<hierarchy><node clickable="true" enabled="'+enabled+'" bounds="'+bounds+'"><node text="+"/></node>'+extra+'</hierarchy>')
 def test_parent(self):self.assertEqual(point(self.tree(),'+'),(150,250))
 def test_duplicates(self):
  with self.assertRaises(AssertionError):point(self.tree('<node text="+" clickable="true" enabled="true" bounds="[400,200][500,300]"/>'),'+')
 def test_disabled_clipped_and_dangerous(self):
  for tree,label in [(self.tree(enabled='false'),'+'),(self.tree(bounds='[100,1200][200,1350]'),'+'),(self.tree(),'Print'),(self.tree(),'Remove')]:
   with self.assertRaises(AssertionError):point(tree,label)
if __name__=='__main__':unittest.main()
