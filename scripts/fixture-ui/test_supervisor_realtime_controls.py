import unittest,xml.etree.ElementTree as ET
from supervisor_realtime_controls import supervisor_cards
class Supervisor(unittest.TestCase):
 def tree(self):
  root=ET.Element('hierarchy')
  for label in ['Orders tab','Queue tab','Order for Backend Test Customer A, Active, 1 item · 2 units','Order for Backend Test Customer B, Empty, No items yet']:ET.SubElement(root,'node',{'content-desc':label,'enabled':'true','bounds':'[0,100][720,300]'})
  return root
 def test_both_real_customers(self):self.assertEqual(len(supervisor_cards(self.tree())),2)
 def test_no_role_or_delivery_substitution(self):
  for index in [1,2,3]:
   t=self.tree();t.remove(list(t)[index])
   with self.assertRaises(AssertionError):supervisor_cards(t)
  t=self.tree();ET.SubElement(t,'node',{'content-desc':'Order for Foreign Customer, Empty','enabled':'true','bounds':'[0,100][720,300]'})
  with self.assertRaises(AssertionError):supervisor_cards(t)
if __name__=='__main__':unittest.main()
