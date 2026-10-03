"""Edit only the unique generated number in a new invoice header draft."""
import re
def invoice_number_point(tree):
 labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
 assert 'Search and select GRN...' in labels and 'Auto-generated, can be edited' in labels
 fields=[n for n in tree.iter('node') if n.get('class')=='android.widget.EditText']
 assert len(fields)==1 and fields[0].get('enabled')=='true' and re.fullmatch(r'\d{1,10}',fields[0].get('text',''))
 assert fields[0].get('text')!='20261991','Do not overwrite an existing case draft'
 m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',fields[0].get('bounds',''));assert m
 x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
 return ((x+xx)//2,(y+yy)//2,fields[0].get('text'))
