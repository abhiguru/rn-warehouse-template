"""Server-selection preparation may leave only a validated Orders or Settings screen."""
def selection_start(tree,profile):
 assert profile in {'Core Demo Administrator','Switch Demo Administrator'}
 labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
 assert not labels.intersection({'Submit Dispatch','Confirm Submission','Create GRN','Save Invoice','Review Invoice','Send OTP','Verify Your Phone','No internet connection'}),'Do not leave drafts, authentication or offline screens'
 if 'View profile for '+profile in labels:return 'settings'
 assert {'Orders tab','Refresh orders'}<=labels,'Validated protected Orders or bound Settings required'
 return 'orders'
