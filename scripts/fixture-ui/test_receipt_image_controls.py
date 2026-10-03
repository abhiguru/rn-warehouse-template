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
    def test_exact_native_photo_label_includes_displayed_trailing_space(self):
        t=ET.fromstring('<hierarchy><node text="Add Photos " class="android.widget.TextView" enabled="true" bounds="[1,1][50,50]"/></hierarchy>')
        self.assertEqual(point(t,'Add Photos ','WAREHOUSE_FIXTURE_FXF502.png'),(25,25))
        with self.assertRaises(AssertionError):point(t,'Add Photos','WAREHOUSE_FIXTURE_FXF502.png')

    def test_list_view_requires_recent_and_clickable_text_control(self):
        t=ET.fromstring('<hierarchy><node content-desc="List view" class="android.widget.TextView" enabled="true" clickable="true" bounds="[594,248][678,332]"/></hierarchy>')
        with self.assertRaises(AssertionError):point(t,'List view','WAREHOUSE_FIXTURE_FXF502.png')
        t.append(ET.fromstring('<node text="Recent"/>'))
        self.assertEqual(point(t,'List view','WAREHOUSE_FIXTURE_FXF502.png'),(636,290))
        t[0].set('clickable','false')
        with self.assertRaises(AssertionError):point(t,'List view','WAREHOUSE_FIXTURE_FXF502.png')

    def test_library_action_requires_exact_source_dialog(self):
        t=ET.fromstring('<hierarchy><node text="PHOTO LIBRARY" class="android.widget.Button" enabled="true" bounds="[1,1][50,50]"/></hierarchy>')
        with self.assertRaises(AssertionError):point(t,'PHOTO LIBRARY','WAREHOUSE_FIXTURE_FXF502.png')
        t.extend([ET.fromstring('<node text="Add Image"/>'),ET.fromstring('<node text="Choose image source"/>')]);self.assertEqual(point(t,'PHOTO LIBRARY','WAREHOUSE_FIXTURE_FXF502.png'),(25,25))
    def test_exact_file_selection_works_in_grid_and_list_without_view_toggle(self):
        filename='WAREHOUSE_FIXTURE_FXF502.png'
        for container in ['android.widget.GridView','android.widget.ListView']:
            t=ET.fromstring('<hierarchy><node text="Recent"/><node class="'+container+'"><node text="'+filename+'" class="android.widget.TextView" enabled="true" bounds="[10,100][200,180]"/></node></hierarchy>')
            self.assertEqual(point(t,filename,filename),(105,140))
            with self.assertRaises(AssertionError):point(t,'WAREHOUSE_FIXTURE_OTHER.png',filename)
            t[1].append(ET.fromstring('<node text="'+filename+'" enabled="true" bounds="[10,200][200,280]"/>'))
            with self.assertRaises(AssertionError):point(t,filename,filename)

if __name__=='__main__':unittest.main()
