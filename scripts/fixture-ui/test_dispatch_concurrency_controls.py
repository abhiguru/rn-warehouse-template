import unittest
import xml.etree.ElementTree as ET
from dispatch_concurrency_controls import stale_stock_error,grn_controls
class RaceControls(unittest.TestCase):
    def tree(self,message='Insufficient stock: Backend Test Potatoes (Available: 1, Requested: 2)',extra=''):
        return ET.fromstring('<hierarchy><node text="Error" bounds="[1,1][10,10]"/><node text="'+message+'" bounds="[1,11][100,40]"/><node text="OK" bounds="[1,41][10,50]"/>'+extra+'</hierarchy>')
    def test_exact_fresh_receipt_uses_real_prefix_search(self):
        self.assertEqual(grn_controls('FXQ993'),('Use GRN prefix F',[]))
        with self.assertRaises(AssertionError):grn_controls('FXF410')
    def test_actual_stale_stock_error(self):
        self.assertEqual(stale_stock_error(self.tree())['status'],'PASS')
    def test_unrelated_error_or_success_cannot_pass(self):
        for tree in [self.tree('Network request failed'),self.tree('Insufficient stock: Backend Test Potatoes (Available: 0, Requested: 2)'),self.tree(extra='<node text="Dispatch Created Successfully!" bounds="[1,1][10,10]"/>')]:
            with self.assertRaises(AssertionError):stale_stock_error(tree)
if __name__=='__main__':unittest.main()
