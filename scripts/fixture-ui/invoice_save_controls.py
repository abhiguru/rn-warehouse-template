"""Closed native actions for the reserved IRN01 rounding invoice only."""
import re
ACTIONS={'Search and select GRN...','IRN01','Go to Review step','Submit Invoice','Create','View Invoice List','Overview tab','Breakdown tab'}
def bounds(n):
 m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',n.get('bounds',''));assert m;x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280;return x,y,xx,yy
def point(tree,label):
 assert label in ACTIONS;nodes=[n for n in tree.iter('node') if label in [n.get('text'),n.get('content-desc')]];buttons=[n for n in nodes if n.get('class')=='android.widget.Button'];nodes=buttons or nodes;assert len(nodes)==1 and nodes[0].get('enabled')=='true';x,y,xx,yy=bounds(nodes[0]);return (x+xx)//2,(y+yy)//2
def money_row(tree,label,value):
 assert label in {'Subtotal (Storage)','Labour Charges','Tax Amount','Grand Total','Total Amount'};assert value in {9,20,150,179};labels=[n for n in tree.iter('node') if n.get('text')==label];assert len(labels)==1;x,y,xx,yy=bounds(labels[0]);matches=[]
 for n in tree.iter('node'):
  if re.sub(r'\s','',n.get('text','')) not in {'₹'+str(value),'₹'+str(value)+'.00'}:continue
  try:a,b,aa,bb=bounds(n)
  except AssertionError:continue
  if a>=xx and abs((b+bb)-(y+yy))<=24:matches.append(n)
 assert len(matches)==1,'Matching visible invoice financial row required'
