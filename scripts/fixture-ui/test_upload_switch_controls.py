import unittest
import xml.etree.ElementTree as ET
from upload_switch_controls import point,timing_proof,FILENAME,MESSAGE

class UploadSwitchControls(unittest.TestCase):
    def test_exact_refusal_acknowledgment_only(self):
        tree=ET.fromstring('<hierarchy><node text="OK" class="android.widget.Button" enabled="true" bounds="[10,10][100,100]"/></hierarchy>')
        with self.assertRaises(AssertionError):point(tree,'OK')
        tree.extend([ET.Element('node',text='Operation In Progress'),ET.Element('node',text=MESSAGE)])
        self.assertEqual(point(tree,'OK'),(55,55))
        tree.append(ET.fromstring('<node text="OK" class="android.widget.Button" enabled="true" bounds="[10,10][100,100]"/>'))
        with self.assertRaises(AssertionError):point(tree,'OK')
    def test_upload_requires_named_clickable_enabled_control(self):
        tree=ET.fromstring('<hierarchy><node content-desc="Add GRN image" clickable="true" enabled="true" bounds="[10,10][100,100]"/></hierarchy>')
        self.assertEqual(point(tree,'Add GRN image'),(55,55))
        for key,value in [('enabled','false'),('clickable','false'),('bounds','[10,10][900,100]')]:
            bad=ET.fromstring(ET.tostring(tree));bad[0].set(key,value)
            with self.assertRaises(AssertionError):point(bad,'Add GRN image')
        for label in ['Delete image','Camera','Create GRN','Send OTP']:
            with self.assertRaises(AssertionError):point(tree,label)
    def test_only_fresh_case_file_selected_without_view_toggle(self):
        tree=ET.fromstring('<hierarchy><node text="Recent"/><node text="'+FILENAME+'" enabled="true" bounds="[10,10][100,100]"/></hierarchy>')
        self.assertEqual(point(tree,FILENAME),(55,55))
        with self.assertRaises(AssertionError):point(tree,'WAREHOUSE_FIXTURE_FXF502.png')
    def test_refusal_must_be_within_actual_hold(self):
        events=[{'event':'switch-upload-delay-start','delayMs':30000,'monotonicMs':1000},{'event':'switch-upload-delay-release','delayMs':30000,'monotonicMs':31010}]
        self.assertTrue(timing_proof(events,1200)['refusalDuringHeldUpload'])
        for when in [999,31010,float('nan')]:
            with self.assertRaises(AssertionError):timing_proof(events,when)
        with self.assertRaises(AssertionError):timing_proof(events+events,1200)

if __name__=='__main__':unittest.main()
