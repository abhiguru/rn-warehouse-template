import unittest
from confirmed_draft_controls import credential_presence
class Controls(unittest.TestCase):
    def fake(self,secure='ABSENT',legacy='0',uid='0'):
        self.calls=[]
        def adb(*args):
            self.calls.append(args)
            if args==('shell','id','-u'):return uid
            if args[:3]==('shell','sh','-c'):return secure
            return legacy
        return adb
    def test_secure_or_legacy_credentials_block_clearance(self):
        for secure,legacy in [('PRESENT','0'),('ABSENT','1'),('PRESENT','7')]:
            self.assertTrue(credential_presence(self.fake(secure,legacy)))
        self.assertFalse(credential_presence(self.fake()))
    def test_unreadable_or_unowned_state_is_never_absence(self):
        for kwargs in [{'uid':'2000'},{'secure':''},{'secure':'Permission denied'},{'legacy':''},{'legacy':'0\n1'},{'legacy':'[credential value]'}]:
            with self.assertRaises(AssertionError):credential_presence(self.fake(**kwargs))
    def test_on_device_commands_return_only_presence_and_counts(self):
        credential_presence(self.fake())
        script=self.calls[1][-1]
        self.assertIn('grep -Eq',script);self.assertIn('echo PRESENT',script);self.assertIn('echo ABSENT',script)
        self.assertNotIn('cat ',script);self.assertNotIn('grep -E ',script)
        query=self.calls[2][-1];self.assertIn('SELECT count(*)',query);self.assertNotIn('SELECT value',query)
        self.assertIn('-readonly',query)
if __name__=='__main__':unittest.main()
