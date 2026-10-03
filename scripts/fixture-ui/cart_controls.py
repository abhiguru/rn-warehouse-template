"""Visible unique clickable parent controls for the fictional cart only."""
import re
ALLOWED={'Add item to order','Order for Backend Test Customer A, Empty, No items yet','+','−','+10','Add (1)','Remove'}
def point(tree,label):
 assert label in ALLOWED
 if label=='Remove':assert any(n.get('text')=='Remove Backend Test Potatoes from order?' for n in tree.iter('node'))
 parents={c:p for p in tree.iter() for c in p};targets=[]
 for n in tree.iter('node'):
  if label not in [n.get('text'),n.get('content-desc')]:continue
  candidate=n
  while candidate is not None and candidate.get('clickable')!='true':candidate=parents.get(candidate)
  assert candidate is not None and candidate.get('enabled')=='true','Enabled clickable cart action required'
  if candidate not in targets:targets.append(candidate)
 assert len(targets)==1,'Distinct cart controls refused'
 m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',targets[0].get('bounds',''));assert m
 x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280,'Visible cart control required'
 return (x+xx)//2,(y+yy)//2

def prepared_cart(value,config_sha256,artifact_sha256):
 assert value.get('status')=='PASS' and value.get('businessWriteAttempted') is False
 assert value.get('catalogHeldForGuardedSubmission') is True and value.get('otpRequests')==0
 assert value.get('configSHA256')==config_sha256 and value.get('artifactSHA256')==artifact_sha256
 assert {'EXISTING_EMPTY_OPEN_ASSIGNED_CART','B_RECORD_SEARCH_DENIED','EXACT_A_FRESH_STOCK_VISIBLE','NO_BUSINESS_AUTH_OR_STOCK_CHANGE'}<=set(value.get('phases',[]))
