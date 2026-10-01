import unittest,xml.etree.ElementTree as E
from invoice_save_controls import point,money_row
class SaveControls(unittest.TestCase):
 def test_unapproved_writes_and_print_refused(self):
  for label in ['Print','Delete','Edit','Share PDF','IRP01','Retry','Send OTP']:
   with self.assertRaises(AssertionError):point(E.fromstring('<hierarchy/>'),label)
 def test_wrong_row_or_hidden_amount_cannot_authorize_save(self):
  t=E.fromstring('<hierarchy><node text="Grand Total" bounds="[30,500][170,540]"/><node text="₹179.00" bounds="[300,200][470,240]"/></hierarchy>')
  with self.assertRaises(AssertionError):money_row(t,'Grand Total',179)
  t[1].set('bounds','[300,500][470,540]');money_row(t,'Grand Total',179)
  t[1].set('bounds','[300,500][470,2000]')
  with self.assertRaises(AssertionError):money_row(t,'Grand Total',179)
 def test_duplicate_create_refused(self):
  t=E.fromstring('<hierarchy><node text="Create" enabled="true" class="android.widget.Button" bounds="[10,10][40,40]"/><node text="Create" enabled="true" class="android.widget.Button" bounds="[50,10][80,40]"/></hierarchy>')
  with self.assertRaises(AssertionError):point(t,'Create')
 def test_one_parent_child_control_allowed_but_two_controls_refused(self):
  t=E.fromstring('<hierarchy><node text="Search and select GRN..." enabled="true" bounds="[51,827][606,877]"><node text="Search and select GRN..." enabled="true" bounds="[51,827][606,877]"/></node></hierarchy>');self.assertEqual(point(t,'Search and select GRN...'),(328,852))
  t[0][0].set('bounds','[52,827][606,877]')
  with self.assertRaises(AssertionError):point(t,'Search and select GRN...')
 def test_grn_search_input_cannot_be_selected_as_record(self):
  t=E.fromstring('<hierarchy><node text="IRN01" class="android.widget.EditText" enabled="true" bounds="[99,166][635,247]"/></hierarchy>')
  with self.assertRaises(AssertionError):point(t,'IRN01')
  E.SubElement(t,'node',{'text':'IRN01','class':'android.widget.TextView','enabled':'true','bounds':'[56,370][135,407]'});self.assertEqual(point(t,'IRN01'),(95,388))
if __name__=='__main__':unittest.main()
