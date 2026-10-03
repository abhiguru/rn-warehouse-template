import unittest,xml.etree.ElementTree as ET
from receipt_draft_controls import point,review_labels
class ReceiptControls(unittest.TestCase):
    def test_submission_authentication_and_discard_are_not_draft_actions(self):
        t=ET.fromstring('<hierarchy/>')
        for label in ['Create GRN','Create','Update','Discard','Send OTP','Retry','Cancel']:
            with self.assertRaises(AssertionError):point(t,label)
    def test_labelled_fields_and_button_role_are_unique_and_visible(self):
        t=ET.fromstring('<hierarchy><node content-desc="Receipt item quantity" class="android.widget.EditText" enabled="true" bounds="[1,1][50,50]"/></hierarchy>')
        self.assertEqual(point(t,'Receipt item quantity',True),(25,25))
        t.append(ET.fromstring('<node content-desc="Receipt item quantity" class="android.widget.EditText"/>'))
        with self.assertRaises(AssertionError):point(t,'Receipt item quantity',True)
    def test_foreign_or_confirmation_review_is_refused(self):
        t=ET.fromstring('<hierarchy><node text="Confirm Create"/></hierarchy>')
        with self.assertRaises(AssertionError):review_labels(t,'FXF501',4,20)
if __name__=='__main__':unittest.main()
