"""Only the initially empty owned customer-name field may receive a draft marker."""
import re
def customer_name_point(tree):
 nodes=[n for n in tree.iter('node') if n.get('class')=='android.widget.EditText' and n.get('text')=='Enter customer name']
 assert len(nodes)==1 and nodes[0].get('enabled')=='true'
 match=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',nodes[0].get('bounds',''));assert match
 x,y,xx,yy=map(int,match.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
 return (x+xx)//2,(y+yy)//2
