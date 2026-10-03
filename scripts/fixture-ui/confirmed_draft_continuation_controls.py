"""Require the changed source marker to be absent in a real destination form."""
import re
def cleared_draft(tree,kind,marker):
    labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
    assert not any(marker in v for v in labels),'Old source draft survives'
    fields=[n for n in tree.iter('node') if n.get('class')=='android.widget.EditText']
    if kind=='customer':
        fields=[n for n in fields if n.get('text') in ['', 'Enter customer name'] and n.get('content-desc') in ['',None,'Enter customer name']]
        assert 'Enter customer name' in labels
    elif kind=='grn':
        fields=[n for n in fields if n.get('content-desc')=='Receipt number']
        assert 'Receipt number' in labels
    elif kind=='invoice':
        assert 'Search and select GRN...' in labels and 'Auto-generated, can be edited' in labels
        fields=[n for n in fields if re.fullmatch(r'\d{1,10}',n.get('text',''))]
    else:
        assert kind=='dispatch'
        fields=[n for n in fields if n.get('text') in ['', 'Additional notes (max 250 characters)']]
        assert 'Additional notes (max 250 characters)' in labels
    assert len(fields)==1 and fields[0].get('enabled')=='true','Unique actual destination default field required'
    m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',fields[0].get('bounds',''));assert m
    x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
    if kind=='grn':assert fields[0].get('text',''),'Actual destination default must have loaded'
    return True
