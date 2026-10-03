import unittest
from replacement_controls import observations,identity,empty_credentials,discovery
class ReplacementControls(unittest.TestCase):
 def test_one_discovery_or_missing_transport_fields_refused(self):
  row={'atUTC':'2026-10-01T23:00:00Z','event':'complete','method':'GET','status':200,'path':'/functions/v1/get-public-config','authorizationPresent':False,'credentialQueryPresent':False}
  with self.assertRaises(AssertionError):observations([row],'2026-10-01T22:59:00Z')
  self.assertEqual(len(observations([row,row],'2026-10-01T22:59:00Z')),2)
  for key in ['authorizationPresent','credentialQueryPresent']:
   bad={**row,key:True}
   with self.assertRaises(AssertionError):observations([row,bad],'2026-10-01T22:59:00Z')
   bad=dict(row);bad.pop(key)
   with self.assertRaises(AssertionError):observations([row,bad],'2026-10-01T22:59:00Z')
 def test_equal_origin_does_not_substitute_for_new_identity(self):
  with self.assertRaises(AssertionError):identity({'origin':'https://backend-core.example.test','instanceId':'a'*36},'b'*36)
 def test_pending_enrollment_or_old_cache_refused(self):
  good={'securePresence':{'enrollment':False,'auth':False},'legacyCredentialKeys':[],'protectedCacheKeys':[]};empty_credentials(good)
  for bad in [{**good,'securePresence':{'enrollment':True}},{**good,'legacyCredentialKeys':['auth_token']},{**good,'protectedCacheKeys':['grn_detail_old']}]:
   with self.assertRaises(AssertionError):empty_credentials(bad)
 def test_discovery_envelope_and_exact_instance_and_origin(self):
  d={'instanceId':'a'*36,'canonicalOrigin':'https://backend-core.example.test','supabaseUrl':'https://backend-core.example.test','supportedApiVersions':['1']};self.assertEqual(discovery({'success':True,'data':d},'a'*36),d)
  for bad in [d,{'success':False,'data':d},{'success':True,'data':{**d,'canonicalOrigin':'https://other.example.test'}},{'success':True,'data':{**d,'instanceId':'b'*36}}]:
   with self.assertRaises(AssertionError):discovery(bad,'a'*36)
if __name__=='__main__':unittest.main()
