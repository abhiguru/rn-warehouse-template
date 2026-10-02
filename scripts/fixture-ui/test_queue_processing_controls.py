import unittest,xml.etree.ElementTree as ET
from queue_processing_controls import expand_customer,generate_dispatch,queue_review
class Queue(unittest.TestCase):
 def tree(self,expanded=False,enabled='true'):
  root=ET.Element('hierarchy')
  for label in ['Order Queue','Queue tab','Backend Test Customer A, 1 items, '+('collapse' if expanded else 'expand')]+(['Generate dispatch'] if expanded else []):ET.SubElement(root,'node',{'content-desc':label,'enabled':enabled,'bounds':'[0,100][720,200]'})
  return root
 def test_exact_native_customer(self):
  self.assertEqual(expand_customer(self.tree()),(360,150));self.assertEqual(generate_dispatch(self.tree(True)),(360,150))
 def test_no_ambiguous_disabled_or_other_customer(self):
  with self.assertRaises(AssertionError):expand_customer(self.tree(enabled='false'))
  t=self.tree();list(t)[2].set('content-desc','Backend Test Customer B, 1 items, expand')
  with self.assertRaises(AssertionError):expand_customer(t)
  t=self.tree(True);ET.SubElement(t,'node',{'content-desc':'Generate dispatch','enabled':'true','bounds':'[0,100][720,200]'})
  with self.assertRaises(AssertionError):generate_dispatch(t)
  t=self.tree(True);ET.SubElement(t,'node',{'text':'Some Items Skipped'})
  with self.assertRaises(AssertionError):generate_dispatch(t)
 def test_exact_review_and_foreign_refusal(self):
  t=ET.Element('hierarchy')
  for x in ['FXQ992','FXC701/8','2 qty','To: Backend Test Customer A','Submit Dispatch']:ET.SubElement(t,'node',{'text':x})
  self.assertEqual(queue_review(t)['dispatchQuantity'],2)
  list(t)[3].set('text','To: Backend Test Customer B')
  with self.assertRaises(AssertionError):queue_review(t)
  list(t)[3].set('text','To: Backend Test Customer A');list(t)[2].set('text','3 qty')
  with self.assertRaises(AssertionError):queue_review(t)
if __name__=='__main__':unittest.main()
