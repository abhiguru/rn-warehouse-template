"""Public supervisor Orders evidence; no credentials or socket payloads."""
import datetime,re

def supervisor_cards(tree):
 labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
 assert 'Orders tab' in labels and 'Queue tab' in labels,'Actual supervisor navigation required'
 nodes=[n for n in tree.iter('node') if n.get('content-desc','').startswith('Order for ')]
 assert len(nodes)==2,'Both independently provisioned customer cards required'
 expected=['Order for Backend Test Customer A, ','Order for Backend Test Customer B, ']
 cards=[]
 for prefix in expected:
  matched=[n for n in nodes if n.get('content-desc','').startswith(prefix)]
  assert len(matched)==1 and matched[0].get('enabled')=='true'
  assert re.fullmatch(r'\[\d+,\d+\]\[\d+,\d+\]',matched[0].get('bounds',''))
  cards.append(matched[0].get('content-desc'))
 assert not labels.intersection({'Send OTP','Verification Failed','Configuration Error'})
 return cards

def fresh_trigger(value,now=None):
 t=datetime.datetime.fromisoformat(value.replace('Z','+00:00'));assert t.tzinfo is not None
 age=((now or datetime.datetime.now(datetime.timezone.utc))-t).total_seconds();assert 0<=age<=120
 return value
