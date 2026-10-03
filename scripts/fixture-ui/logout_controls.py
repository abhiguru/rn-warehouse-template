"""Only the sign-out confirmation; reject unrelated and duplicate actions."""
import re
MESSAGE='Are you sure you want to sign out of your account?'
def confirm_point(tree):
 assert any(n.get('text')==MESSAGE for n in tree.iter('node'))
 parents={child:parent for parent in tree.iter() for child in parent};targets=[]
 for node in tree.iter('node'):
  if node.get('text')!='Sign Out':continue
  candidate=node
  while candidate is not None and candidate.get('clickable')!='true':candidate=parents.get(candidate)
  if candidate is None:continue
  if any(n.get('text') in [MESSAGE,'Cancel'] for n in candidate.iter('node')):continue
  assert candidate.get('enabled')=='true'
  if candidate not in targets:targets.append(candidate)
 assert len(targets)==1,'One confirmation action required'
 m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',targets[0].get('bounds',''));assert m
 x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
 return (x+xx)//2,(y+yy)//2

def avatar_point(tree,avatar):
 assert avatar in ['C','N']
 nodes=[n for n in tree.iter('node') if n.get('content-desc')==avatar and n.get('clickable')=='true']
 assert len(nodes)==1 and nodes[0].get('enabled')=='true' and nodes[0].get('class')=='android.view.ViewGroup' and nodes[0].get('bounds')=='[616,75][693,138]'
 return 654,106
