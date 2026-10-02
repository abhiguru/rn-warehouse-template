"""Only the bound generated default in the exact receipt-number input may receive this draft marker."""
import re
def grn_number_point(tree,expected):
 assert expected=='A0001'
 nodes=[n for n in tree.iter('node') if n.get('class')=='android.widget.EditText' and n.get('content-desc')=='Receipt number']
 assert len(nodes)==1 and nodes[0].get('enabled')=='true' and nodes[0].get('text','')==expected
 m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',nodes[0].get('bounds',''));assert m
 x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
 return (x+xx)//2,(y+yy)//2
