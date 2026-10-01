import unittest
from emulator_offline_network import rule,restore_fixture_loopback,airplane
class OwnedOffline(unittest.TestCase):
    def test_invalid_identity_has_no_device_writes(self):
        for uid,marker in [(0,'whvm-offline-0106-02'),(10130,'foreign'),(10130,'whvm-offline-0106-01')]:
            calls=[]
            with self.assertRaises(AssertionError):restore_fixture_loopback(lambda *x:calls.append(x),uid,marker)
            self.assertFalse(calls)
    def test_wrong_rule_uid_refuses_delete(self):
        calls=[]
        def adb(*args):
            calls.append(args)
            if args==('emu','avd','name'):return 'TestWarehouseFixture_API30'
            if args==('shell','getprop','ro.build.version.sdk'):return '30'
            if args==('shell','id','-u'):return '0'
            return '-A OUTPUT -m owner --uid-owner 10131 -d 127.0.0.1/32 -p tcp --dport 443 -m comment --comment whvm-offline-0106-02 -j REJECT --reject-with tcp-reset'
        with self.assertRaises(AssertionError):restore_fixture_loopback(adb,10130,'whvm-offline-0106-02')
        self.assertFalse(any('-D' in x for x in calls))
    def test_unknown_airplane_state_refuses_mutation(self):
        calls=[]
        def adb(*args):
            calls.append(args)
            return 'TestWarehouseFixture_API30' if args==('emu','avd','name') else '30' if 'getprop' in args else '0' if 'id' in args else 'unknown'
        with self.assertRaises(AssertionError):airplane(adb,'0','1')
        self.assertFalse(any('cmd' in x for x in calls))
if __name__=='__main__':unittest.main()
