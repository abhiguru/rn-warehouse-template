"""Public native hierarchy checks; no event payloads or credentials are retained."""
import datetime,re

def own_card(tree):
    nodes=[n for n in tree.iter('node') if n.get('content-desc','').startswith('Order for ')]
    assert len(nodes)==1,'Exactly one assigned-customer card required'
    n=nodes[0];label=n.get('content-desc','')
    assert label.startswith('Order for Backend Test Customer B, '),'Foreign customer card'
    assert 'Customer A' not in label and n.get('enabled')=='true'
    assert re.fullmatch(r'\[\d+,\d+\]\[\d+,\d+\]',n.get('bounds',''))
    labels={v for x in tree.iter('node') for v in [x.get('text'),x.get('content-desc')] if v}
    assert not any('Backend Test Customer A' in v or 'FixtureRealtimeIsolation0109A' in v for v in labels)
    assert 'Orders tab' in labels
    return label

def fresh_trigger(value,now=None):
    t=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
    assert t.tzinfo is not None
    age=((now or datetime.datetime.now(datetime.timezone.utc))-t).total_seconds()
    assert 0<=age<=120,'Fresh bounded event timestamp required'
    return value
