"""Strict receipt quantity admission evidence; never authorize save or submit."""
import re

def receipt_rejection_config(c):
 assert c['scope']=='isolated-fictional-native-receipt-quantity-rejection'
 assert c['profileId']=='947136fa-997b-4a83-819d-1b8bd3ecba68'
 assert c['profileName']=='New customer' and c['role']=='supervisor'
 assert c['origin']=='https://backend-core.example.test'
 assert c['instanceId']=='b0ec3933-5258-4bd5-87f4-d57b13a78971'
 assert c['record']=='FXV991' and c['quantities']==['0','-1','1.5']
 assert c['versionCode']==2026100110
 assert c['applicationCommit']=='c422f62cd36cb407e7ed7bfce28c4db5189e2bd5'
 assert re.fullmatch(r'[a-f0-9]{64}',c['artifactSHA256'])
 assert c['artifactSHA256']!='08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7'
 return c

def receipt_rejected_quantity(tree,value):
 assert value in ['0','-1','1.5']
 fields=[n for n in tree.iter('node') if n.get('class')=='android.widget.EditText' and n.get('content-desc')=='Receipt item quantity']
 assert len(fields)==1 and fields[0].get('enabled')=='true' and fields[0].get('text')==value,'Exact entered receipt quantity required'
 buttons=[n for n in tree.iter('node') if n.get('content-desc')=='Save receipt item']
 assert len(buttons)==1 and buttons[0].get('enabled')=='false','Invalid receipt quantity must disable item save'
 m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',buttons[0].get('bounds',''));assert m
 x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
 labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
 assert 'Backend Test Potatoes' in labels
 assert not labels.intersection({'Confirm Create','Create GRN','GRN Created Successfully!','Send OTP','Verification Failed','Error'})
 return {'status':'PASS','enteredQuantity':value,'saveItemDisabled':True,'scope':'receipt item admission only; full independent state reconciliation separate'}
