import io,unittest
from PIL import Image
from b_image_render_controls import checkerboard_png,COLORS,archive_hierarchy
class RenderChecks(unittest.TestCase):
 def encode(self,im):
  out=io.BytesIO();im.save(out,format='PNG');return out.getvalue()
 def fixture(self):
  im=Image.new('RGB',(720,1280),'white')
  for row in range(4):
   for col in range(4):im.paste(COLORS[(row+col)%2],(8+col*50,420+row*50,8+(col+1)*50,420+(row+1)*50))
  return im
 def test_real_checkerboard_pattern(self):self.assertEqual(checkerboard_png(self.encode(self.fixture()))['bounds'],[8,420,208,620])
 def test_solid_color_two_colors_and_wrong_dimensions_refuse(self):
  for im in [Image.new('RGB',(720,1280),COLORS[0]),Image.new('RGB',(64,64),COLORS[0])]:
   with self.assertRaises(AssertionError):checkerboard_png(self.encode(im))
  im=self.fixture();im.paste(COLORS[0],(8,420,208,620))
  with self.assertRaises(AssertionError):checkerboard_png(self.encode(im))
 def test_different_pattern_and_ambiguous_colors_refuse(self):
  im=self.fixture();im.paste(COLORS[0],(58,420,108,470))
  with self.assertRaises(AssertionError):checkerboard_png(self.encode(im))
  im=self.fixture();im.paste(COLORS[1],(500,800,550,850))
  with self.assertRaises(AssertionError):checkerboard_png(self.encode(im))
class ArchiveChecks(unittest.TestCase):
 def test_redacts_private_digits_and_preserves_original_tree_and_file(self):
  import tempfile,pathlib,xml.etree.ElementTree as ET
  with tempfile.TemporaryDirectory() as directory:
   tree=ET.fromstring('<hierarchy><node text="919888888873" content-desc="123456"/></hierarchy>')
   path=archive_hierarchy(tree,pathlib.Path(directory),'authorized-B-images-tab')
   self.assertEqual(tree[0].get('text'),'919888888873')
   saved=path.read_text();self.assertNotIn('919888888873',saved);self.assertNotIn('123456',saved);self.assertIn('[private digits]',saved)
   self.assertEqual(path.stat().st_mode&0o077,0)
   with self.assertRaises(FileExistsError):archive_hierarchy(tree,pathlib.Path(directory),'authorized-B-images-tab')
   self.assertEqual(path.read_text(),saved)
 def test_other_labels_and_public_directories_refused(self):
  import tempfile,pathlib,xml.etree.ElementTree as ET
  with tempfile.TemporaryDirectory() as directory:
   path=pathlib.Path(directory);tree=ET.fromstring('<hierarchy/>')
   with self.assertRaises(AssertionError):archive_hierarchy(tree,path,'../other')
   path.chmod(0o755)
   with self.assertRaises(AssertionError):archive_hierarchy(tree,path,'authorized-B-images-tab')
   path.chmod(0o700)

if __name__=='__main__':unittest.main()
