import unittest,xml.etree.ElementTree as ET
from cart_controls import point,prepared_cart
class Controls(unittest.TestCase):
 def tree(self,extra='',enabled='true',bounds='[100,200][200,300]'):
  return ET.fromstring('<hierarchy><node clickable="true" enabled="'+enabled+'" bounds="'+bounds+'"><node text="+"/></node>'+extra+'</hierarchy>')
 def test_parent(self):self.assertEqual(point(self.tree(),'+'),(150,250))
 def test_duplicates(self):
  with self.assertRaises(AssertionError):point(self.tree('<node text="+" clickable="true" enabled="true" bounds="[400,200][500,300]"/>'),'+')
 def test_disabled_clipped_and_dangerous(self):
  for tree,label in [(self.tree(enabled='false'),'+'),(self.tree(bounds='[100,1200][200,1350]'),'+'),(self.tree(),'Print'),(self.tree(),'Remove')]:
   with self.assertRaises(AssertionError):point(tree,label)
class Preparation(unittest.TestCase):
 def test_refuses_failed_changed_or_writing_preparation(self):
  v={'status':'PASS','businessWriteAttempted':False,'catalogHeldForGuardedSubmission':True,'otpRequests':0,'configSHA256':'a','artifactSHA256':'b','phases':['EXISTING_EMPTY_OPEN_ASSIGNED_CART','B_RECORD_SEARCH_DENIED','EXACT_A_FRESH_STOCK_VISIBLE','NO_BUSINESS_AUTH_OR_STOCK_CHANGE']}
  prepared_cart(v,'a','b')
  for edit in [{'status':'FAIL'},{'businessWriteAttempted':True},{'catalogHeldForGuardedSubmission':False},{'otpRequests':1},{'configSHA256':'other'},{'artifactSHA256':'other'},{'phases':[]}]:
   with self.assertRaises(AssertionError):prepared_cart({**v,**edit},'a','b')
if __name__=='__main__' :unittest.main()
