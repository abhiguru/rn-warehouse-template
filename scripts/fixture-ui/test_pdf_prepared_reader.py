import hashlib, importlib.util, json, tempfile, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('prepared_reader',Path(__file__).with_name('pdf-reader-prepared-select-api30.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PreparedReaderTests(unittest.TestCase):
 def test_rejects_failed_unbound_or_already_selected_preparations(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'case.json';path.write_text('{}')
   before={'status':'PASS','documentGenerationAttempted':True};cfg={'apkSHA256':'a'*64}
   prepared={'status':'PASS','readerNotSelected':True,'artifactSHA256':cfg['apkSHA256'],'configSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),'prepareDriverSHA256':hashlib.sha256(Path(m.__file__).with_name('pdf-prepare-api30.py').read_bytes()).hexdigest()}
   m.validate_prepared(before,prepared,cfg,path)
   for field,value in [('status','FAIL'),('readerNotSelected',False),('artifactSHA256','b'*64),('configSHA256','c'*64),('prepareDriverSHA256','d'*64)]:
    with self.subTest(field=field),self.assertRaises(AssertionError):m.validate_prepared(before,{**prepared,field:value},cfg,path)
   with self.assertRaises(AssertionError):m.validate_prepared({**before,'status':'FAIL'},prepared,cfg,path)
if __name__=='__main__':unittest.main()
