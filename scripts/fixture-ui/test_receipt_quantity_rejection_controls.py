import unittest,xml.etree.ElementTree as ET
from receipt_quantity_rejection_controls import receipt_rejected_quantity
class ReceiptQuantity(unittest.TestCase):
 def tree(self,value='0',enabled='false'):
  t=ET.Element('hierarchy')
  ET.SubElement(t,'node',{'class':'android.widget.EditText','content-desc':'Receipt item quantity','text':value,'enabled':'true'})
  ET.SubElement(t,'node',{'class':'android.widget.Button','content-desc':'Save receipt item','enabled':enabled,'bounds':'[10,100][100,160]'})
  ET.SubElement(t,'node',{'text':'Backend Test Potatoes'})
  return t
 def test_native_invalid_values_disable_save(self):
  for value in ['0','-1','1.5']:
   self.assertTrue(receipt_rejected_quantity(self.tree(value),value)['saveItemDisabled'])
 def test_refuses_truncation_enabled_save_ambiguity_and_confirmation(self):
  with self.assertRaises(AssertionError):receipt_rejected_quantity(self.tree('1'),'1.5')
  with self.assertRaises(AssertionError):receipt_rejected_quantity(self.tree(enabled='true'),'0')
  t=self.tree();ET.SubElement(t,'node',{'class':'android.widget.EditText','content-desc':'Receipt item quantity','text':'0','enabled':'true'})
  with self.assertRaises(AssertionError):receipt_rejected_quantity(t,'0')
  t=self.tree();ET.SubElement(t,'node',{'text':'Confirm Create'})
  with self.assertRaises(AssertionError):receipt_rejected_quantity(t,'0')
if __name__=='__main__':unittest.main()
