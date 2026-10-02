"""Strict native create-item quantity rejection evidence; never authorize taps."""
import re

def rejection_config(c):
 assert c['scope']=='isolated-fictional-native-dispatch-quantity-rejection'
 assert c['profileId']=='947136fa-997b-4a83-819d-1b8bd3ecba68'
 assert c['profileName']=='New customer' and c['role']=='supervisor'
 assert c['artifactSHA256']=='08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7'
 assert c['origin']=='https://backend-core.example.test'
 assert c['instanceId']=='b0ec3933-5258-4bd5-87f4-d57b13a78971'
 assert c['sourceReceipt']=='FXF410' and c['stockLineId']=='c15f781e-bdba-11f1-819c-236af9dbe2c3'
 assert c['sourceQuantity']==20 and c['expectedStock']==20
 assert c['record']=='FXQ991' and c['quantities']==[0,21]
 return c

def rejected_quantity(tree,quantity):
 assert type(quantity) is int and quantity in [0,21]
 fields=[n for n in tree.iter('node') if n.get('class')=='android.widget.EditText' and n.get('content-desc')=='Dispatch quantity']
 assert len(fields)==1 and fields[0].get('enabled')=='true' and (fields[0].get('text') in ['', 'Qty'] if quantity==0 else fields[0].get('text')==str(quantity))
 buttons=[n for n in tree.iter('node') if n.get('content-desc')=='Save dispatch item']
 assert len(buttons)==1 and buttons[0].get('enabled')=='false','Invalid quantity must not admit item save'
 assert re.fullmatch(r'\[\d+,\d+\]\[\d+,\d+\]',buttons[0].get('bounds',''))
 labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
 assert 'Qty: 20 · Stock: 20' in labels and 'Backend Test Potatoes' in labels
 assert not labels.intersection({'Confirm Submission','Dispatch Created Successfully!','Send OTP','Verification Failed'})
 if quantity==21:assert 'Quantity exceeds available stock (20)' in labels
 return {'status':'PASS','quantity':quantity,'saveItemDisabled':True,'scope':'native invalid quantity admission only; SQL/stock reconciliation separate'}
