import unittest
from discovery_failure_network import rule,reject_switching,restore_switching,matched_switching_packets,MARKER

class Controls(unittest.TestCase):
    def test_actual_packet_evidence(self):
        row='2 120 REJECT tcp -- * * 0.0.0.0/0 10.0.2.2 tcp dpt:443 owner UID match 10123 /* '+MARKER+' */ reject-with icmp-port-unreachable'
        self.assertEqual(matched_switching_packets(row,'10123',MARKER),{'packets':2,'bytes':120})
        for value in [row.replace('2 120','0 0'),row.replace('10.0.2.2','127.0.0.1'),row.replace('10123','10124'),row+'\n'+row]:
            with self.assertRaises(AssertionError):matched_switching_packets(value,'10123',MARKER)
    def test_refusal(self):
        for uid,marker in [('0',MARKER),('1000',MARKER),('10123;bad',MARKER),('10123','other'),(10123,MARKER)]:
            with self.assertRaises(AssertionError):rule(uid,marker)
        self.assertIn('10.0.2.2',rule('10123',MARKER));self.assertNotIn('127.0.0.1',rule('10123',MARKER))
    def test_exact_restore(self):
        calls=[];active=False
        def adb(*args):
            nonlocal active
            calls.append(args)
            if args==('shell','id','-u'):return '0'
            if args==('shell','cat','/etc/hosts'):return '127.0.0.1 backend-core.example.test\n10.0.2.2 backend-switch.example.test'
            if args==('shell','iptables','-S','OUTPUT'):return MARKER if active else '-P OUTPUT ACCEPT'
            if args[2]=='-I':active=True
            if args[2]=='-D':active=False
            return ''
        reject_switching(adb,'10123',MARKER);restore_switching(adb,'10123',MARKER)
        self.assertFalse(active);self.assertEqual([x for x in calls if len(x)>2 and x[2]=='-D'][0][4:],tuple(rule('10123',MARKER)))
    def test_existing_rule_refuses(self):
        def adb(*args):
            if args==('shell','id','-u'):return '0'
            if args==('shell','cat','/etc/hosts'):return '127.0.0.1 backend-core.example.test\n10.0.2.2 backend-switch.example.test'
            return MARKER
        with self.assertRaises(AssertionError):reject_switching(adb,'10123',MARKER)

if __name__=='__main__':unittest.main()
