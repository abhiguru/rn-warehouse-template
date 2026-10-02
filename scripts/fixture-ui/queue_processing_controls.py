"""Strict native queue preparation; submission requires separate reconciled gates."""
import re

def queue_config(c):
 assert c['scope']=='isolated-fictional-native-queue-processing'
 assert c['profileId']=='947136fa-997b-4a83-819d-1b8bd3ecba68' and c['role']=='supervisor'
 assert c['cartId']=='ce9cb158-bdb6-11f1-8391-8b2b4fd918b0'
 assert c['customerId']=='a823809c-bdb6-11f1-b1be-47a66d90b06d'
 assert c['customerName']=='Backend Test Customer A'
 assert c['sourceReceipt']=='FXC701' and c['sourceGRNId']=='a2489c56-bdf3-11f1-97a8-8b3d06ae4c97'
 assert c['record']=='FXQ992' and c['quantity']==2
 assert c['artifactSHA256']=='08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7'
 assert c['origin']=='https://backend-core.example.test' and c['instanceId']=='b0ec3933-5258-4bd5-87f4-d57b13a78971'
 assert c['orderProvenance']=='preserved ordinary API fixture; native customer creation not accepted'
 return c

def control_point(n):
 assert n.get('enabled')=='true' and n.get('class')!='android.widget.EditText'
 m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',n.get('bounds',''));assert m
 x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
 return (x+xx)//2,(y+yy)//2

def expand_customer(tree):
 labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
 assert 'Order Queue' in labels and 'Queue tab' in labels
 nodes=[n for n in tree.iter('node') if n.get('content-desc')=='Backend Test Customer A, 1 items, expand']
 assert len(nodes)==1;return control_point(nodes[0])

def generate_dispatch(tree):
 labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
 assert 'Backend Test Customer A, 1 items, collapse' in labels
 assert 'Order Queue' in labels
 assert not labels.intersection({'Some Items Skipped','Cannot Create Dispatch','Confirm Submission','Submit'})
 nodes=[n for n in tree.iter('node') if n.get('content-desc')=='Generate dispatch']
 assert len(nodes)==1;return control_point(nodes[0])

def queue_review(tree):
 labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
 assert {'FXQ992','FXC701/8','2 qty','To: Backend Test Customer A','Submit Dispatch'}<=labels
 assert not labels.intersection({'Confirm Submission','Error','Send OTP','Some Items Skipped','Dispatch Created Successfully!'})
 assert not any(x.startswith('To: ') and x!='To: Backend Test Customer A' for x in labels)
 return {'record':'FXQ992','receipt':'FXC701','sourceQuantity':8,'dispatchQuantity':2,'customer':'Backend Test Customer A'}
