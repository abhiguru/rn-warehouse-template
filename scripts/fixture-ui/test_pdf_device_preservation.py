import unittest
from pdf_device_preservation import admission
class PDFPreservation(unittest.TestCase):
 def test_only_exact_artifact_customer_invoice_paths_are_admitted(self):
  c={'preserveExistingPDFDeviceFiles':True,'reservedCustomerPDF':True,'invoiceNumber':20261010,'invoiceId':'b515e2b0-bde6-11f1-b80b-1f1c1f6b3e0c','artifactSHA256':'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7'}
  paths={'cache':'/data/user/0/in.gurucold.warehouse.fixture/cache/Invoice_20261010_FY2026-2027.pdf','export':'/sdcard/Download/Librera/Invoice_20261010_FY2026-2027.pdf'}
  admission(c,paths)
  for edit in [{'reservedCustomerPDF':False},{'invoiceNumber':20261001},{'artifactSHA256':'a'*64},{'preserveExistingPDFDeviceFiles':'true'}]:
   with self.assertRaises(AssertionError):admission({**c,**edit},paths)
  for edit in [{'cache':'/data/user/0/foreign/cache/file.pdf'},{'export':'/sdcard/Download/foreign.pdf'}]:
   with self.assertRaises(AssertionError):admission(c,{**paths,**edit})
if __name__=='__main__':unittest.main()
