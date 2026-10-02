import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('b_pdf',Path(__file__).with_name('b-grn-pdf-prepare-api30.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class BGRNPDFControls(unittest.TestCase):
 def test_document_text_requires_real_B_header_and_refuses_A(self):
  p.validate_B_pdf_text('GRN FXC702 Backend Test Customer B')
  for text in ['GRN FXC701 Backend Test Customer B','GRN FXC702 Backend Test Customer A','GRN FXC702 Backend Test Customer B Backend Test Customer A']:
   with self.assertRaises(AssertionError):p.validate_B_pdf_text(text)
if __name__=='__main__':unittest.main()
