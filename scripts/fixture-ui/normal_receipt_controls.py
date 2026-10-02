import re
ALLOWED={'Add Photos ','PHOTO LIBRARY','WAREHOUSE_FIXTURE_FXN801.png','Grid view','OPEN','Open','Create GRN','Create','View GRN List'}
def point(tree,label):
 assert label in ALLOWED,'Unsupported normal receipt action'
 labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
 if label=='PHOTO LIBRARY':assert {'Add Image','Choose image source'}<=labels
 if label in {'WAREHOUSE_FIXTURE_FXN801.png','Grid view'}:assert 'Recent' in labels
 if label=='Create GRN':assert {'FXN801','Backend Test Customer A','Backend Test Potatoes','GRN Images (1)'}<=labels
 if label=='Create':assert {'Confirm Create','Are you sure you want to create this GRN with 1 item?'}<=labels
 if label=='View GRN List':assert 'GRN Created Successfully!' in labels
 parents={c:p for p in tree.iter() for c in p};targets=[]
 for n in tree.iter('node'):
  if label not in [n.get('text'),n.get('content-desc')]:continue
  while n is not None and n.get('clickable')!='true':n=parents.get(n)
  assert n is not None and n.get('enabled')=='true'
  if n not in targets:targets.append(n)
 assert len(targets)==1,'Unique normal receipt control required'
 m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',targets[0].get('bounds',''));assert m
 x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
 return (x+xx)//2,(y+yy)//2
