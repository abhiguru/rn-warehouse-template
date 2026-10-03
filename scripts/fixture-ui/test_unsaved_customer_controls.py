import unittest,xml.etree.ElementTree as ET
from unsaved_customer_controls import customer_name_point
class Controls(unittest.TestCase):
 def tree(self,text='Enter customer name',bounds='[20,200][700,260]',enabled='true'):
  return ET.fromstring('<hierarchy><node class="android.widget.EditText" text="'+text+'" enabled="'+enabled+'" bounds="'+bounds+'"/></hierarchy>')
 def test_unique_empty_visible_name(self):
  self.assertEqual(customer_name_point(self.tree()),(360,230))
  for tree in [self.tree('Existing draft'),self.tree(bounds='[20,1300][700,1400]'),self.tree(enabled='false')]:
   with self.assertRaises(AssertionError):customer_name_point(tree)
  tree=self.tree();tree.append(self.tree()[0])
  with self.assertRaises(AssertionError):customer_name_point(tree)
if __name__=='__main__':unittest.main()
