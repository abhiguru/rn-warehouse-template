import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('qr_driver',Path(__file__).with_name('qr-api30.py'))
qr=importlib.util.module_from_spec(spec);spec.loader.exec_module(qr)


class QRControls(unittest.TestCase):
    def test_authentication_screens_never_produce_unmasked_image_evidence(self):
        driver=qr.QR.__new__(qr.QR);driver.archive=lambda label:None
        for labels in [['Send OTP'],['Cancel','Send OTP'],['Cancel','Verify Your Phone'],['Cancel','Enrollment status']]:
            tree=ET.Element('hierarchy')
            for label in labels:ET.SubElement(tree,'node',text=label)
            driver.snapshot=lambda:tree
            with patch.object(qr.subprocess,'run') as run:
                driver.archive_camera('test');run.assert_not_called()

    def test_activation_authentication_and_generic_permission_actions_refused(self):
        driver=qr.QR.__new__(qr.QR)
        with patch.object(qr.auth.Auth,'tap') as tap:
            for label in ['Use this server','Send OTP','Allow','While using the app','CHANGE SERVER','Submit Dispatch']:
                with self.assertRaises(AssertionError):driver.tap(label)
            tap.assert_not_called()

    def test_only_scan_and_login_selection_navigation_are_allowed(self):
        driver=qr.QR.__new__(qr.QR)
        with patch.object(qr.auth.Auth,'tap') as tap:
            driver.tap('Change warehouse server');driver.tap('Scan QR code')
            self.assertEqual([c.args[0] for c in tap.call_args_list],['Change warehouse server','Scan QR code'])

    def test_camera_permission_refuses_missing_or_ambiguous_observation(self):
        driver=qr.QR.__new__(qr.QR)
        for value,expected in [('android.permission.CAMERA: granted=false',False),('android.permission.CAMERA: granted=true',True)]:
            driver.adb=lambda *args:value
            self.assertIs(driver.camera_permission(),expected)
        for value in ['', 'android.permission.CAMERA: granted=true\nandroid.permission.CAMERA: granted=false']:
            driver.adb=lambda *args:value
            with self.assertRaises(AssertionError):driver.camera_permission()


if __name__=='__main__':unittest.main()
