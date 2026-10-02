"""Exact optional-notes controls; no stock selection or submission actions."""
import re
def bounds_point(n):
 assert n.get('enabled')=='true' and n.get('class')!='android.widget.EditText'
 m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',n.get('bounds',''));assert m
 x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280 and yy-y<=200
 return (x+xx)//2,(y+yy)//2
def optional_toggle_point(tree):
 nodes=[n for n in tree.iter('node') if n.get('text')=='Show Optional Fields'];assert len(nodes)==1
 parents={child:parent for parent in tree.iter('node') for child in parent};n=nodes[0]
 for _ in range(4):
  if n.get('clickable')=='true':return bounds_point(n)
  assert n in parents;n=parents[n]
 raise AssertionError('Exact optional-fields toggle unavailable')
def dispatch_notes_point(tree):
 nodes=[n for n in tree.iter('node') if n.get('class')=='android.widget.EditText' and n.get('text')=='Additional notes (max 250 characters)'];assert len(nodes)==1 and nodes[0].get('enabled')=='true'
 m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',nodes[0].get('bounds',''));assert m
 x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
 return (x+xx)//2,(y+yy)//2
