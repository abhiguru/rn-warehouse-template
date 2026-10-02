import unittest,xml.etree.ElementTree as ET
from confirmed_draft_continuation_controls import cleared_draft
class Controls(unittest.TestCase):
    def tree(self,text='Enter customer name',enabled='true',bounds='[20,200][700,260]'):
        return ET.fromstring('<hierarchy><node class="android.widget.EditText" text="'+text+'" enabled="'+enabled+'" bounds="'+bounds+'"/></hierarchy>')
    def test_real_empty_customer_field_and_marker_denial(self):
        self.assertTrue(cleared_draft(self.tree(),'customer','Fixture VM0110 confirmed customer'))
        for t in [self.tree('Fixture VM0110 confirmed customer'),self.tree('Someone else'),self.tree(enabled='false'),self.tree(bounds='[20,1300][700,1400]')]:
            with self.assertRaises(AssertionError):cleared_draft(t,'customer','Fixture VM0110 confirmed customer')
        t=self.tree();t.append(self.tree()[0])
        with self.assertRaises(AssertionError):cleared_draft(t,'customer','Fixture VM0110 confirmed customer')
    def test_receipt_requires_actual_default_and_never_old_source_number(self):
        t=self.tree('A0001');t[0].set('content-desc','Receipt number');self.assertTrue(cleared_draft(t,'grn','FXS992'))
        for text in ['','FXS992']:
            t[0].set('text',text)
            with self.assertRaises(AssertionError):cleared_draft(t,'grn','FXS992')
    def test_invoice_and_dispatch_require_their_real_form_context(self):
        t=self.tree('20262000')
        for text in ['Search and select GRN...','Auto-generated, can be edited']:ET.SubElement(t,'node',text=text)
        self.assertTrue(cleared_draft(t,'invoice','20261992'));t[0].set('text','20261992')
        with self.assertRaises(AssertionError):cleared_draft(t,'invoice','20261992')
        t=self.tree('Additional notes (max 250 characters)');self.assertTrue(cleared_draft(t,'dispatch','Fixture VM0110 confirmed dispatch'))
        t[0].set('text','Fixture VM0110 confirmed dispatch')
        with self.assertRaises(AssertionError):cleared_draft(t,'dispatch','Fixture VM0110 confirmed dispatch')
if __name__=='__main__':unittest.main()
