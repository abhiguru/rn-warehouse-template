import unittest,xml.etree.ElementTree as ET
from normal_receipt_controls import point
class Controls(unittest.TestCase):
 def tree(self,label,extra=''):
  return ET.fromstring('<hierarchy><node clickable="true" enabled="true" bounds="[100,200][200,300]"><node text="'+label+'"/></node>'+extra+'</hierarchy>')
 def test_confirmation_and_dangerous_controls(self):
  for label in ['Print','Create','WAREHOUSE_FIXTURE_FXF502.png','List view','View GRN List']:
   with self.assertRaises(AssertionError):point(self.tree(label),label)
  extra='<node text="Confirm Create"/><node text="Are you sure you want to create this GRN with 1 item?"/>'
  self.assertEqual(point(self.tree('Create',extra),'Create'),(150,250))
 def test_grid_filename_needs_owned_recent_context_and_unique_control(self):
  label='WAREHOUSE_FIXTURE_FXN801.png'
  with self.assertRaises(AssertionError):point(self.tree(label),label)
  self.assertEqual(point(self.tree(label,'<node text="Recent"/>'),label),(150,250))
  with self.assertRaises(AssertionError):point(self.tree(label,'<node text="Recent"/><node text="'+label+'" clickable="true" enabled="true" bounds="[300,200][400,300]"/>'),label)
class GridCaption(unittest.TestCase):
 def test_matches_metadata_caption_without_accepting_similar_or_preview_names(self):
  filename='WAREHOUSE_FIXTURE_FXN801.png'
  def tree(caption):return ET.fromstring('<hierarchy><node text="Recent"/><node clickable="true" enabled="true" bounds="[42,350][244,553]"><node content-desc="'+caption+'"/></node></hierarchy>')
  self.assertEqual(point(tree(filename+', 826 B, 1:17 AM'),filename),(143,451))
  for caption in [filename+'.backup, 826 B','Preview the file '+filename,'WAREHOUSE_FIXTURE_FXF502.png, 826 B']:
   with self.assertRaises(AssertionError):point(tree(caption),filename)
if __name__=='__main__' :unittest.main()
