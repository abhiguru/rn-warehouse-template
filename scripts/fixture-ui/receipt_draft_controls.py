"""Pure, closed receipt draft controls; no submit, authentication or discard."""
from dispatch_draft_controls import point as bounded_point

FIELDS={'Receipt number','Search customers...','Type to search...','Receipt item quantity','Receipt item weight'}
BUTTONS={'Select sender...','Backend Test Customer A','Go to Items step','Go to Review step','Save receipt item','Select receipt item Backend Test Potatoes'}

def point(tree,label,editable=False):
    assert label in (FIELDS if editable else BUTTONS), 'Unsupported receipt draft action'
    return bounded_point(tree,label,editable=editable,button=not editable and label in {'Backend Test Customer A','Select receipt item Backend Test Potatoes','Save receipt item'})

def review_labels(tree,record,quantity,weight):
    labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
    assert {record,'Backend Test Customer A','Backend Test Potatoes','Create GRN'} <= labels, 'Bound single-item receipt review required'
    assert not labels.intersection({'Confirm Create','Error','Send OTP','GRN Created Successfully!'}), 'Unexpected native receipt state'
    # Number formatting is validated separately against the actual displayed review,
    # with independent SQL verifying exact quantity/weight after a submission.
    assert isinstance(quantity,int) and 0<quantity<=50 and isinstance(weight,int) and 0<weight<=1000
    return sorted(labels)
