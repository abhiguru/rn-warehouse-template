import unittest,xml.etree.ElementTree as ET
from receipt_image_controls import point,foreground
class GalleryControls(unittest.TestCase):
    def test_foreign_gallery_and_unexpected_actions_refused(self):
        for window in ['mCurrentFocus=Window{1 u0 other.app/Gallery}','mCurrentFocus=null']:
            with self.assertRaises(AssertionError):foreground(window,'in.gurucold.warehouse.fixture',True)
        foreground('mCurrentFocus=Window{1 u0 com.android.documentsui/Picker}','in.gurucold.warehouse.fixture',True)
        with self.assertRaises(AssertionError):foreground('mCurrentFocus=Window{1 u0 com.android.documentsui/Picker}','in.gurucold.warehouse.fixture')
        for label in ['Camera','Delete','Allow','Send OTP','Create GRN']:
            with self.assertRaises(AssertionError):point(ET.fromstring('<hierarchy/>'),label,'WAREHOUSE_FIXTURE_FXF502.png')
    def test_library_action_requires_exact_source_dialog(self):
        t=ET.fromstring('<hierarchy><node text="PHOTO LIBRARY" class="android.widget.Button" enabled="true" bounds="[1,1][50,50]"/></hierarchy>')
        with self.assertRaises(AssertionError):point(t,'PHOTO LIBRARY','WAREHOUSE_FIXTURE_FXF502.png')
        t.extend([ET.fromstring('<node text="Add Image"/>'),ET.fromstring('<node text="Choose image source"/>')]);self.assertEqual(point(t,'PHOTO LIBRARY','WAREHOUSE_FIXTURE_FXF502.png'),(25,25))
if __name__=='__main__':unittest.main()
