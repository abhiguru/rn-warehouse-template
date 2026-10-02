import unittest,xml.etree.ElementTree as ET
from unsaved_invoice_controls import invoice_number_point
class InvoiceDraft(unittest.TestCase):
 def tree(self,text='20261011',enabled='true',bounds='[20,200][700,260]',grn='Search and select GRN...'):
  root=ET.Element('hierarchy');ET.SubElement(root,'node',{'text':grn});ET.SubElement(root,'node',{'text':'Auto-generated, can be edited'});ET.SubElement(root,'node',{'class':'android.widget.EditText','text':text,'enabled':enabled,'bounds':bounds});return root
 def test_new_generated_number(self):self.assertEqual(invoice_number_point(self.tree()),(360,230,'20261011'))
 def test_refusals(self):
  for root in [self.tree('20261991'),self.tree(''),self.tree('invalid'),self.tree(enabled='false'),self.tree(bounds='[20,200][800,260]'),self.tree(grn='IRN01')]:
   with self.assertRaises(AssertionError):invoice_number_point(root)
  root=self.tree();ET.SubElement(root,'node',{'class':'android.widget.EditText','text':'1','enabled':'true','bounds':'[20,200][700,260]'})
  with self.assertRaises(AssertionError):invoice_number_point(root)
if __name__=='__main__':unittest.main()
