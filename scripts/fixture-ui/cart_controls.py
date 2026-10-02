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
