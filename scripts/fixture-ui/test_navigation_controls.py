import unittest
import xml.etree.ElementTree as ET
from navigation_controls import point, disconnect, reconnect

class Controls(unittest.TestCase):
    def test_foreign_ports_and_unknown_radio_inputs_refused_before_adb(self):
        calls=[]
        for fn in [disconnect,reconnect]:
            for original,port in [({'wifi_on':'1','mobile_data':'0'},9999), ({'other':'1'},18443), ({'wifi_on':'0','mobile_data':'0'},18443)]:
                with self.assertRaises(AssertionError):fn(lambda *args:calls.append(args),original,port)
        self.assertFalse(calls)

    def test_dangerous_and_ambiguous_buttons_are_refused(self):
        tree=ET.fromstring('<hierarchy><node text="Use this server" enabled="true" class="android.widget.Button" bounds="[1,1][50,50]"/></hierarchy>')
        self.assertEqual(point(tree,'Use this server'),(25,25))
        with self.assertRaises(AssertionError):point(tree,'Send OTP')
        with self.assertRaises(AssertionError):point(tree,'Delete Account')
        tree.append(ET.fromstring('<node text="Use this server"/>'))
        with self.assertRaises(AssertionError):point(tree,'Use this server')

    def test_reconnect_never_overwrites_an_occupied_route(self):
        calls=[]
        def adb(*args):calls.append(args);return 'owner tcp:443 tcp:9999'
        with self.assertRaises(AssertionError):reconnect(adb,{'wifi_on':'1','mobile_data':'0'},18443)
        self.assertEqual(calls,[('reverse','--list')])

    def test_changed_radio_state_blocks_restoration_before_any_write(self):
        calls=[]
        def adb(*args):calls.append(args);return '' if args==('reverse','--list') else '1'
        with self.assertRaises(AssertionError):reconnect(adb,{'wifi_on':'1','mobile_data':'0'},18443)
        self.assertFalse(any('svc' in x or 'tcp:443' in x for x in calls))

    def test_owned_network_roundtrip_preserves_original_radio_settings(self):
        calls=[];state={'wifi_on':'1','mobile_data':'0'};route=[18443]
        def adb(*args):
            calls.append(args)
            if args==('reverse','--list'):return 'owner tcp:443 tcp:'+str(route[0]) if route else ''
            if args[:2]==('reverse','--remove'):route.clear()
            elif args[:2]==('reverse','tcp:443'):route.append(int(args[2].split(':')[1]))
            elif args[:3]==('shell','settings','get'):return state[args[-1]]
            elif args[:2]==('shell','svc'):state['wifi_on' if args[2]=='wifi' else 'mobile_data']='1' if args[3]=='enable' else '0'
            return ''
        original=dict(state);disconnect(adb,original,18443);self.assertFalse(route)
        reconnect(adb,original,18443);self.assertEqual(state,original);self.assertEqual(route,[18443])

if __name__=='__main__':unittest.main()
