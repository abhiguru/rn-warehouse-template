import unittest
import xml.etree.ElementTree as ET
from dispatch_case_controls import Attempts, submission_point


class CaseControls(unittest.TestCase):
    def test_no_second_write_without_reconciliation_and_no_third_write(self):
        a = Attempts(); a.authorize()
        with self.assertRaises(AssertionError): a.authorize()
        a.verified_loss(); a.authorize()
        with self.assertRaises(AssertionError): a.authorize()

    def test_cannot_preapprove_loss(self):
        with self.assertRaises(AssertionError): Attempts().verified_loss()

    def test_confirmation_requires_exact_document_and_single_item(self):
        t = ET.Element('hierarchy')
        for label in ['Submit', 'Confirm Submission', 'You are about to create dispatch FXF901 with 1 item.\n\nThis will update stock levels. Continue?']:
            ET.SubElement(t, 'node', {'text': label, 'enabled': 'true', 'bounds': '[1,2][100,200]', 'class': 'android.widget.Button'})
        self.assertEqual(submission_point(t, 'Submit', 'FXF901'), (50,101))
        with self.assertRaises(AssertionError): submission_point(t, 'Submit', 'FXF902')
        with self.assertRaises(AssertionError): submission_point(t, 'Discard', 'FXF901')
        t.append(list(t)[0])
        with self.assertRaises(AssertionError): submission_point(t, 'Submit', 'FXF901')

    def test_ok_only_dismisses_observed_error(self):
        t = ET.Element('hierarchy'); ET.SubElement(t, 'node', {'text':'OK', 'enabled':'true','bounds':'[1,2][100,200]'})
        with self.assertRaises(AssertionError): submission_point(t, 'OK', 'FXF901')
        ET.SubElement(t, 'node', {'text':'Error'})
        submission_point(t, 'OK', 'FXF901')


if __name__ == '__main__': unittest.main()
