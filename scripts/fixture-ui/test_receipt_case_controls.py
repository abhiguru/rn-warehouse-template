import unittest,xml.etree.ElementTree as ET
from receipt_case_controls import submission_point,Attempts
from dispatch_case_cleanup import cleanup_case
class ReceiptCase(unittest.TestCase):
    def test_confirmation_requires_exact_message_and_button_role(self):
        t=ET.fromstring('<hierarchy><node text="Confirm Create"/><node text="Are you sure you want to create this GRN with 1 item?"/><node text="Create" enabled="true" class="android.widget.Button" bounds="[1,1][50,50]"/><node text="Create" class="android.widget.TextView"/></hierarchy>')
        self.assertEqual(submission_point(t,'Create','FXF501'),(25,25))
        with self.assertRaises(AssertionError):submission_point(t,'Submit','FXF501')
        t[1].set('text','Are you sure you want to create this GRN with 2 items?')
        with self.assertRaises(AssertionError):submission_point(t,'Create','FXF501')
    def test_retry_requires_reconciliation_and_never_allows_third_write(self):
        a=Attempts();a.authorize()
        with self.assertRaises(AssertionError):a.authorize()
        a.verified_loss();a.authorize()
        with self.assertRaises(AssertionError):a.authorize()
    def test_unapproved_cleanup_path_refuses_before_control_or_adb(self):
        calls=[]
        with self.assertRaises(AssertionError):cleanup_case(True,True,'FXF501','before-upstream',lambda x:calls.append(x),lambda *a:calls.append(a),lambda *a:calls.append(a),path='/production')
        self.assertFalse(calls)
    def test_receipt_cleanup_preserves_evidence_before_disarming(self):
        calls=[]
        def control(c):
            calls.append(c['action'])
            return {'state':'DROPPED_BEFORE_UPSTREAM','record':'FXF501','phase':'before-upstream','path':'/rest/v1/rpc/save_grn'} if c['action']=='status' else {'observations':[],'overflow':False} if c['action']=='observations' else {'state':'DISARMED'}
        route=[18643]
        def adb(*a):
            if a==('reverse','--list'):return 'owned tcp:443 tcp:'+str(route[0])
            route[0]=18443
        result=cleanup_case(True,True,'FXF501','before-upstream',control,adb,lambda *a:calls.append('saved'),path='/rest/v1/rpc/save_grn')
        self.assertEqual(result['status'],'PASS');self.assertEqual(calls,['status','observations','saved','disarm'])
if __name__=='__main__':unittest.main()
