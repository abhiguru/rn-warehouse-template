import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET
spec=importlib.util.spec_from_file_location('auth',Path(__file__).with_name('auth-api30.py'))
auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth)

class Controls(unittest.TestCase):
    def tree(self,extra='',bounds='[20,40][200,100]',enabled='true'):
        return ET.fromstring('<hierarchy><node text="Send OTP" class="android.widget.Button" enabled="'+enabled+'" bounds="'+bounds+'"/>'+extra+'</hierarchy>')
    def test_visible_enabled_button(self):self.assertEqual(auth.point(self.tree(),'Send OTP'),(110,70))
    def test_duplicate(self):
        with self.assertRaises(AssertionError):auth.point(self.tree('<node text="Send OTP" class="android.widget.Button" enabled="true" bounds="[20,40][200,100]"/>'),'Send OTP')
    def test_hidden_or_disabled(self):
        for tree in [self.tree(bounds='[20,1300][200,1400]'),self.tree(enabled='false')]:
            with self.assertRaises(AssertionError):auth.point(tree,'Send OTP')
    def test_unsafe_actions(self):
        for label in ['Wait','Close app','Resend code','Retry']:
            with self.assertRaises(AssertionError):auth.point(self.tree(),label)
    def test_formatted_mobile(self):
        self.assertTrue(auth.input_matches('Enter your mobile number','988 888 8871','9888888871'))
        self.assertFalse(auth.input_matches('Enter your mobile number','988 888 8872','9888888871'))
        self.assertFalse(auth.input_matches('Server origin','https://a.test','https://b.test'))
    def test_input_mismatch(self):
        with self.assertRaises(AssertionError):auth.point(self.tree(),'Send OTP',True)
if __name__=='__main__':unittest.main()
