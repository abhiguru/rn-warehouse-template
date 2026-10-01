import unittest
import xml.etree.ElementTree as ET
from dispatch_draft_controls import point, draft_labels


def tree(label='Create Dispatch', bounds='[1,2][100,200]', enabled='true', kind='android.widget.Button'):
    root = ET.Element('hierarchy')
    ET.SubElement(root, 'node', {'text': label, 'bounds': bounds, 'enabled': enabled, 'class': kind})
    return root


class Controls(unittest.TestCase):
    def test_visible_unique_control(self):
        self.assertEqual(point(tree(), 'Create Dispatch'), (50, 101))
        t = tree(); t.append(list(t)[0])
        with self.assertRaises(AssertionError): point(t, 'Create Dispatch')

    def test_digit_accessibility_label_disambiguates_prefix_count(self):
        t = tree('9')
        key = ET.SubElement(t, 'node', {'text': '9', 'content-desc': 'Enter GRN digit 9',
                             'enabled': 'true', 'bounds': '[200,400][300,500]', 'class': 'android.widget.Button'})
        with self.assertRaises(AssertionError): point(t, '9')
        self.assertEqual(point(t, 'Enter GRN digit 9'), (250,450))
        key.set('enabled', 'false')
        with self.assertRaises(AssertionError): point(t, 'Enter GRN digit 9')

    def test_mutation_and_auth_controls_refused(self):
        for label in ['Submit', 'Submit Dispatch', 'Discard', 'Send OTP', 'Retry']:
            with self.assertRaises(AssertionError): point(tree(label), label)

    def test_disabled_offscreen_and_wrong_input_refused(self):
        for t in [tree(enabled='false'), tree(bounds='[0,0][0,0]'), tree(bounds='[0,0][800,1200]'), tree(kind='android.widget.EditText')]:
            with self.assertRaises(AssertionError): point(t, 'Create Dispatch')

    def test_review_requires_both_reserved_documents(self):
        t = tree('Submit Dispatch')
        for label in ['FXF901', 'FXF900/10']: ET.SubElement(t, 'node', {'text': label})
        draft_labels(t, 'FXF901', 'FXF900', 10)
        for label in ['FXF902', 'FXF903']:
            with self.assertRaises(AssertionError): draft_labels(t, label, 'FXF900', 10)
        ET.SubElement(t, 'node', {'text': 'Confirm Submission'})
        with self.assertRaises(AssertionError): draft_labels(t, 'FXF901', 'FXF900', 10)


if __name__ == '__main__': unittest.main()
