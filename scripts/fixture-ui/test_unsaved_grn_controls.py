import unittest,xml.etree.ElementTree as ET
from unsaved_grn_controls import grn_number_point
class GRNDraft(unittest.TestCase):
 def tree(self,text='A0001',enabled='true',bounds='[20,200][700,260]',label='Receipt number'):
  root=ET.Element('hierarchy');ET.SubElement(root,'node',{'class':'android.widget.EditText','content-desc':label,'text':text,'enabled':enabled,'bounds':bounds});return root
 def test_bound_default(self):self.assertEqual(grn_number_point(self.tree(),'A0001'),(360,230))
 def test_refusals(self):
  for root in [self.tree('FXS991'),self.tree(''),self.tree('A0002'),self.tree(enabled='false'),self.tree(bounds='[20,200][800,260]'),self.tree(label='Vehicle number')]:
   with self.assertRaises(AssertionError):grn_number_point(root,'A0001')
  root=self.tree();root.append(list(root)[0])
  with self.assertRaises(AssertionError):grn_number_point(root,'A0001')
  with self.assertRaises(AssertionError):grn_number_point(self.tree(),'A0002')
if __name__=='__main__':unittest.main()
