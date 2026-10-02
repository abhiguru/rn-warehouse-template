import datetime,unittest,xml.etree.ElementTree as ET
from realtime_controls import card,committed
class RealtimeControls(unittest.TestCase):
    def tree(self,labels):
        t=ET.Element('hierarchy')
        for label in labels:ET.SubElement(t,'node',{'content-desc':label,'enabled':'true','bounds':'[0,100][720,300]'})
        return t
    def test_exact_native_card_and_customer_isolation(self):
        label='Order for Backend Test Customer A, Active, 1 item · 1 unit'
        self.assertEqual(card(self.tree([label]),1),label)
        for labels in [[label,label],[label,'Order for Backend Test Customer B, Active, 1 item · 1 unit'],[label.replace('1 unit','2 units')],[]]:
            with self.assertRaises(AssertionError):card(self.tree(labels),1)
    def test_empty_cart_is_a_visible_native_card_not_an_absent_order(self):
        label='Order for Backend Test Customer A, Empty, No items yet'
        self.assertEqual(card(self.tree([label]),0),label)
        for labels in [[],[label,label],[label.replace('Customer A','Customer B')]]:
            with self.assertRaises(AssertionError):card(self.tree(labels),0)
    def test_protocol_refuses_unreconciled_wrong_phase_quantity_and_credentials(self):
        v={'status':'COMMITTED','phase':'added','since':datetime.datetime.now(datetime.timezone.utc).isoformat(),'quantity':1,'sqlReconciled':True}
        self.assertEqual(committed(v,'added'),v['since'])
        for edit in [{'sqlReconciled':False},{'quantity':2},{'phase':'edited'},{'access_token':'secret'},{'since':'2020-01-01T00:00:00Z'}]:
            with self.assertRaises(AssertionError):committed({**v,**edit},'added')
if __name__=='__main__':unittest.main()
