"""Closed native gallery controls for one owned synthetic receipt attachment."""
import re

PICKER_PACKAGES={'com.android.documentsui','com.google.android.documentsui'}

def point(tree,label,filename):
    assert re.fullmatch(r'WAREHOUSE_FIXTURE_FXF502\.png',filename)
    assert label in {'Add Photos ','PHOTO LIBRARY',filename,'OPEN','Open'}, 'Unsupported gallery action'
    labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
    if label=='PHOTO LIBRARY':assert {'Add Image','Choose image source'}<=labels
    nodes=[n for n in tree.iter('node') if label in [n.get('text'),n.get('content-desc')]]
    if label=='Add Photos ':nodes=[n for n in nodes if n.get('class')=='android.widget.TextView']
    elif label in {'PHOTO LIBRARY','OPEN','Open'}:nodes=[n for n in nodes if n.get('class')=='android.widget.Button']
    assert len(nodes)==1 and nodes[0].get('enabled')=='true', 'Exact unique enabled gallery control required'
    m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',nodes[0].get('bounds',''));assert m
    x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
    return (x+xx)//2,(y+yy)//2

def foreground(window,fixture,external=False):
    rows=[x for x in window.splitlines() if 'mCurrentFocus=' in x];assert len(rows)==1
    allowed=PICKER_PACKAGES|{fixture} if external else {fixture}
    assert any(re.search(r'\s'+re.escape(package)+r'/',rows[0]) for package in allowed), 'Unowned or unsupported gallery foreground'
