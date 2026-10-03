"""Closed controls and timing proof for one fictional existing-GRN upload."""
import math
import re

FILENAME='FXS993-switch-upload.png'
MESSAGE='Finish the current operation before switching servers.'

def point(tree,label):
    assert label in {'Add GRN image',FILENAME,'OPEN','Open','OK'}, 'Unsupported upload-switch action'
    labels={value for node in tree.iter('node') for value in [node.get('text'),node.get('content-desc')] if value}
    if label==FILENAME:
        assert 'Recent' in labels, 'Owned DocumentsUI recent-file screen required'
    if label=='OK':
        assert {'Operation In Progress',MESSAGE}<=labels, 'Exact in-flight switch refusal required'
    nodes=[node for node in tree.iter('node') if label in [node.get('text'),node.get('content-desc')] and node.get('enabled')=='true']
    if label in {'OPEN','Open','OK'}:
        nodes=[node for node in nodes if node.get('class')=='android.widget.Button']
    if label=='Add GRN image':
        nodes=[node for node in nodes if node.get('content-desc')==label and node.get('clickable')=='true']
    assert len(nodes)==1, 'Unique enabled upload-switch control required'
    match=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',nodes[0].get('bounds',''));assert match
    x,y,xx,yy=map(int,match.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
    return (x+xx)//2,(y+yy)//2

def timing_proof(events,alert_monotonic_ms):
    # The controller and driver must use the host monotonic clock, not device UTC.
    assert len(events)==2
    start,end=events
    assert start['event']=='switch-upload-delay-start' and end['event']=='switch-upload-delay-release'
    assert set(start)==set(end)=={'event','delayMs','monotonicMs'}
    delay=start['delayMs'];assert type(delay) is int and 500<=delay<=30000 and end['delayMs']==delay
    values=[start['monotonicMs'],end['monotonicMs'],alert_monotonic_ms]
    assert all(type(value) in [int,float] and math.isfinite(value) for value in values)
    assert start['monotonicMs']<=alert_monotonic_ms<end['monotonicMs'], 'Refusal must occur before upload release'
    assert delay-10<=end['monotonicMs']-start['monotonicMs']<=delay+5000, 'Held interval outside execution bound'
    return {'status':'PASS','refusalDuringHeldUpload':True,'delayMs':delay}
