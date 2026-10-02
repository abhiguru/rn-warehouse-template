import unittest,xml.etree.ElementTree as ET
from unsaved_dispatch_controls import optional_toggle_point,dispatch_notes_point
class DispatchDraft(unittest.TestCase):
 def tree(self):
  root=ET.Element('hierarchy');parent=ET.SubElement(root,'node',{'class':'android.view.View','clickable':'true','enabled':'true','bounds':'[20,200][700,250]'});ET.SubElement(parent,'node',{'text':'Show Optional Fields','clickable':'false','class':'android.widget.TextView'});ET.SubElement(root,'node',{'class':'android.widget.EditText','text':'Additional notes (max 250 characters)','enabled':'true','bounds':'[20,300][700,400]'});return root
 def test_exact_new_notes(self):self.assertEqual(optional_toggle_point(self.tree()),(360,225));self.assertEqual(dispatch_notes_point(self.tree()),(360,350))
 def test_refuse_occupied_disabled_and_offscreen(self):
  for key,value in [('text','existing notes'),('enabled','false'),('bounds','[20,300][700,1400]')]:
   root=self.tree();root[-1].set(key,value)
   with self.assertRaises(AssertionError):dispatch_notes_point(root)
  root=self.tree();root.append(root[-1])
  with self.assertRaises(AssertionError):dispatch_notes_point(root)
 def test_refuse_ambiguous_or_large_toggle(self):
  root=self.tree();root[0].append(ET.Element('node',{'text':'Show Optional Fields'}))
  with self.assertRaises(AssertionError):optional_toggle_point(root)
  root=self.tree();root[0].set('bounds','[0,0][720,1280]')
  with self.assertRaises(AssertionError):optional_toggle_point(root)
if __name__=='__main__':unittest.main()
