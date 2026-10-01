"""Pure gates for one receipt fault and one reconciled unchanged retry."""
import re
from dispatch_case_controls import Attempts,owned_reverse_route

def submission_point(tree,label,record):
    assert re.fullmatch(r'FXF\d{2,5}',record)
    assert label in {'Create GRN','Create','OK'}, 'Unsupported receipt submission action'
    labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
    if label=='Create':
        assert {'Confirm Create','Are you sure you want to create this GRN with 1 item?'} <= labels
    elif label=='OK':assert 'Error' in labels
    else:assert record in labels and 'Confirm Create' not in labels
    nodes=[n for n in tree.iter('node') if label in [n.get('text'),n.get('content-desc')] and n.get('class')=='android.widget.Button']
    assert len(nodes)==1 and nodes[0].get('enabled')=='true'
    m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',nodes[0].get('bounds',''));assert m
    x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
    return (x+xx)//2,(y+yy)//2
