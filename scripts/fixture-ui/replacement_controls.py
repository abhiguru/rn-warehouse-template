"""Evidence gates for cold same-origin replacement; no UI writes or OTP."""
import re

def observations(rows,began):
 requests=[x for x in rows if x.get('atUTC','')>=began and x.get('event') in {'request','upgrade-request'}]
 assert requests and sum(x.get('path')=='/functions/v1/get-public-config' for x in requests)>=2,'Two actual native cold discoveries required'
 for x in requests:
  assert x.get('authorizationPresent') is False and x.get('credentialQueryPresent') is False,'Credential-bearing replacement traffic refused'
 return requests

def identity(record,instance):
 assert record['origin']=='https://backend-core.example.test' and record['instanceId']==instance
 assert re.fullmatch(r'[a-f0-9-]{36}',instance)

def empty_credentials(metadata):
 assert not any(metadata['securePresence'].values()),'Old secure credentials/profile/enrollment remained'
 assert metadata['legacyCredentialKeys']==[] and metadata['protectedCacheKeys']==[],'Old legacy credentials or protected cache remained'

def discovery(payload,expected):
 assert payload.get('success') is True and isinstance(payload.get('data'),dict),'Documented public-config envelope required'
 d=payload['data'];assert d.get('instanceId')==expected and d.get('canonicalOrigin')=='https://backend-core.example.test' and d.get('supabaseUrl')=='https://backend-core.example.test';assert '1' in d.get('supportedApiVersions',[]);return d
