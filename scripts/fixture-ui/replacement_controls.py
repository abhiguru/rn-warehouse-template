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
