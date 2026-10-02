"""Strict native evidence and parent/child protocol for fictional Realtime reads."""
import datetime,re

def card(tree,quantity):
    assert quantity in [1,2]
    expected=f'Order for Backend Test Customer A, Active, 1 item · {quantity} unit'+('s' if quantity==2 else '')
    nodes=[n for n in tree.iter('node') if n.get('content-desc','').startswith('Order for ')]
    matched=[n for n in nodes if n.get('content-desc')==expected or n.get('content-desc','').startswith(expected+', Location: ')]
    assert len(matched)==1,'Unique expected assigned-customer order card required'
    assert len(nodes)==1,'Unexpected cross-customer order card'
    node=matched[0];assert node.get('enabled')=='true'
    assert re.fullmatch(r'\[\d+,\d+\]\[\d+,\d+\]',node.get('bounds',''))
    return node.get('content-desc')

def committed(value,phase):
    assert set(value)=={'status','phase','since','quantity','sqlReconciled'}
    assert value['status']=='COMMITTED' and value['phase']==phase and value['sqlReconciled'] is True
    assert value['quantity']=={'added':1,'edited':2}[phase]
    stamp=datetime.datetime.fromisoformat(value['since'].replace('Z','+00:00'))
    assert stamp.tzinfo is not None
    age=(datetime.datetime.now(datetime.timezone.utc)-stamp).total_seconds()
    assert 0<=age<=120,'Fresh bounded trigger timestamp required'
    return value['since']
