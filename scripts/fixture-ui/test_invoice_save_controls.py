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
if __name__=='__main__':unittest.main()
