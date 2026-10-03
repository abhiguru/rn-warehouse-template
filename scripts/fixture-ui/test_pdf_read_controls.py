import unittest,xml.etree.ElementTree as E
from pdf_read_controls import point
class PDFControls(unittest.TestCase):
    def test_print_permission_and_other_targets_refused(self):
        for label in ['Print','Bluetooth','Allow','All files access','Edit Invoice','Delete Invoice','Send OTP','Gmail']:
            with self.assertRaises(AssertionError):point(E.fromstring('<hierarchy/>'),label)
    def test_ambiguous_reader_control_refused(self):
        t=E.fromstring('<hierarchy><node text="Read book" enabled="true" bounds="[1,1][50,50]"/></hierarchy>');self.assertEqual(point(t,'Read book'),(25,25))
        t.append(E.fromstring('<node text="Read book" enabled="true" bounds="[51,1][100,50]"/>'))
        with self.assertRaises(AssertionError):point(t,'Read book')
if __name__=='__main__':unittest.main()
