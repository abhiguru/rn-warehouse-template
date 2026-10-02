"""Exact fictional race bindings and native stale-stock proof."""
def config(c):
    exact={'scope':'isolated-fictional-native-dispatch-concurrency','origin':'https://backend-core.example.test','instanceId':'b0ec3933-5258-4bd5-87f4-d57b13a78971','artifactSHA256':'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69','record':'FXQ994','competitorRecord':'FXQ995','sourceReceipt':'FXQ993','sourceQuantity':3,'quantity':2,'expectedStock':3,'lotId':'400e423c-bea4-11f1-903b-c7dfaaa1d594','sourceGRNId':'400db20e-bea4-11f1-903a-6ffba93074e5'}
    for key,value in exact.items():assert c[key]==value,'Exact fictional race binding required: '+key
    return c

def stale_stock_error(tree):
    labels={n.get('text','') for n in tree.iter('node') if n.get('bounds') not in {None,'[0,0][0,0]'}}
    assert 'Error' in labels and 'OK' in labels
    assert 'Insufficient stock: Backend Test Potatoes (Available: 1, Requested: 2)' in labels
    assert 'Dispatch Created Successfully!' not in labels
    return {'status':'PASS','scope':'actual native stale-stock error only; independent SQL/HTTP reconciliation required'}

def grn_controls(receipt):
    assert receipt=='FXQ993','Exact fresh fictional receipt required'
    # The existing picker searches substring F and returns at most 50 numbers
    # descending. The genuine FXQ993 is selected by its exact displayed label.
    return ('Use GRN prefix F',[])
