"""Only approved local PDF chooser/reader controls; no print or permissions."""
import re

READER='com.foobnix.pro.pdf.reader'
def allowed(label):
    assert label in {'Overview tab','Share PDF','Read book','Librera','Copy to Downloads','Copy to downloads','Open','Read','Close'},'Unsupported PDF action'

def point(tree,label):
    allowed(label);nodes=[n for n in tree.iter('node') if label in [n.get('text'),n.get('content-desc')]]
    buttons=[n for n in nodes if n.get('class')=='android.widget.Button']
    if buttons:nodes=buttons
    assert len(nodes)==1 and nodes[0].get('enabled')=='true','Exact unique PDF control required'
    m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',nodes[0].get('bounds',''));assert m
    x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
    return (x+xx)//2,(y+yy)//2
