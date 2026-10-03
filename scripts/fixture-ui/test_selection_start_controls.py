import unittest,xml.etree.ElementTree as E
from selection_start_controls import selection_start
def tree(*labels):
 t=E.Element('hierarchy')
 for label in labels:E.SubElement(t,'node',{'text':label})
 return t
class SelectionStartTests(unittest.TestCase):
 def test_allows_only_owned_role_settings_or_protected_orders(self):
  self.assertEqual(selection_start(tree('View profile for Core Demo Administrator'),'Core Demo Administrator'),'settings');self.assertEqual(selection_start(tree('Orders tab','Refresh orders'),'Core Demo Administrator'),'orders')
 def test_refuses_draft_even_with_background_orders_and_refuses_auth(self):
  for label in ['Submit Dispatch','Create GRN','Save Invoice','Send OTP','No internet connection']:
   with self.assertRaises(AssertionError):selection_start(tree('Orders tab','Refresh orders',label),'Core Demo Administrator')
 def test_wrong_profile_or_unprepared_screen_cannot_trigger_navigation(self):
  with self.assertRaises(AssertionError):selection_start(tree('View profile for New customer'),'Core Demo Administrator')
  with self.assertRaises(AssertionError):selection_start(tree('Orders tab'),'Core Demo Administrator')
if __name__=='__main__':unittest.main()
