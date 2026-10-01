import unittest
from invoice_read_controls import read_control
class InvoiceReadControls(unittest.TestCase):
    def test_only_matched_fixture_navigation_allowed(self):
        self.assertEqual(read_control('View GRN IRP01','IRP01'),'View GRN IRP01')
        for label in ['Share PDF','Print','Delete','Edit','Save','View GRN IRP02','Create GRN','Send OTP']:
            with self.assertRaises(AssertionError):read_control(label,'IRP01')
    def test_unrecorded_fixture_refused(self):
        for record in ['IRN01','IRP06','FXF502',"IRP01';DELETE"]:
            with self.assertRaises(AssertionError):read_control('Overview tab',record)
if __name__=='__main__':unittest.main()
