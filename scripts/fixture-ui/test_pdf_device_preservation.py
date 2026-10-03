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
 def test_current_supervisor_is_bound_to_exact_APK_and_profile(self):
  c={'preserveExistingPDFDeviceFiles':True,'reservedCustomerPDF':False,'currentSupervisorPDF':True,'profileId':'947136fa-997b-4a83-819d-1b8bd3ecba68','profileName':'New customer','invoiceNumber':20261010,'invoiceId':'b515e2b0-bde6-11f1-b80b-1f1c1f6b3e0c','artifactSHA256':'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69'}
  paths={'cache':'/data/user/0/in.gurucold.warehouse.fixture/cache/Invoice_20261010_FY2026-2027.pdf','export':'/sdcard/Download/Librera/Invoice_20261010_FY2026-2027.pdf'}
  admission(c,paths)
  for edit in [{'profileId':'foreign'},{'reservedCustomerPDF':True},{'artifactSHA256':'a'*64}]:
   with self.assertRaises(AssertionError):admission({**c,**edit},paths)
if __name__=='__main__':unittest.main()
