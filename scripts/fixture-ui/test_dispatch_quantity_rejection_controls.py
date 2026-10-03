import unittest,xml.etree.ElementTree as ET
from dispatch_quantity_rejection_controls import rejected_quantity
class QuantityRejection(unittest.TestCase):
 def tree(self,q=21,enabled='false',stock='Qty: 20 · Stock: 20'):
  root=ET.Element('hierarchy')
  for row in [{'class':'android.widget.EditText','content-desc':'Dispatch quantity','text':'Qty' if q==0 else str(q),'enabled':'true'},{'content-desc':'Save dispatch item','enabled':enabled,'bounds':'[10,100][710,160]'},{'text':stock},{'text':'Backend Test Potatoes'},{'text':'Quantity exceeds available stock (20)'}]:ET.SubElement(root,'node',row)
  return root
 def test_zero_and_excess_disabled(self):
  for q in [0,21]:self.assertEqual(rejected_quantity(self.tree(q),q)['status'],'PASS')
 def test_no_false_rejection(self):
  for t in [self.tree(enabled='true'),self.tree(stock='Qty: 20 · Stock: 17'),self.tree(q=20)]:
   with self.assertRaises(AssertionError):rejected_quantity(t,21)
  t=self.tree();ET.SubElement(t,'node',{'text':'Confirm Submission'})
  with self.assertRaises(AssertionError):rejected_quantity(t,21)
  with self.assertRaises(AssertionError):rejected_quantity(self.tree(),True)
if __name__=='__main__':unittest.main()
