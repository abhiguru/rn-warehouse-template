import unittest
import xml.etree.ElementTree as ET
from invoice_read_controls import read_control,financial_row
class InvoiceReadControls(unittest.TestCase):
    def test_only_matched_fixture_navigation_allowed(self):
        self.assertEqual(read_control('View GRN IRP01','IRP01'),'View GRN IRP01')
        for label in ['Share PDF','Print','Delete','Edit','Save','View GRN IRP02','Create GRN','Send OTP']:
            with self.assertRaises(AssertionError):read_control(label,'IRP01')
    def test_header_cannot_substitute_for_financial_row(self):
        t=ET.fromstring('<hierarchy><node text="Total Amount" bounds="[58,626][238,667]"/><node text="₹147" bounds="[319,224][400,271]"/><node text="₹148" bounds="[584,623][662,670]"/></hierarchy>')
        with self.assertRaises(AssertionError):financial_row(t,'Total Amount',147)
        t[2].set('text','₹147');financial_row(t,'Total Amount',147)
        t[2].set('bounds','[584,623][662,2000]')
        with self.assertRaises(AssertionError):financial_row(t,'Total Amount',147)

    def test_unrecorded_fixture_refused(self):
        for record in ['IRN01','IRP06','FXF502',"IRP01';DELETE"]:
            with self.assertRaises(AssertionError):read_control('Overview tab',record)
if __name__=='__main__':unittest.main()
