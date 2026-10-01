"""Strict screen selectors: no ADB, network or business writes."""
import re

FORBIDDEN = {'Submit', 'Submit Dispatch', 'Confirm Submission', 'Update', 'Update Dispatch',
             'Discard', 'Delete', 'Send OTP', 'Verify', 'Retry'}


def point(tree, label, editable=False):
    assert label not in FORBIDDEN, 'Draft preparation cannot submit, authenticate or discard'
    nodes = [n for n in tree.iter('node') if label in [n.get('text'), n.get('content-desc')]
             and (n.get('class') == 'android.widget.EditText') == editable]
    # Never choose between duplicate controls or guess off-screen coordinates.
    assert len(nodes) == 1, 'Unique native control required'
    n = nodes[0]
    assert n.get('enabled') == 'true', 'Enabled native control required'
    match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', n.get('bounds', ''))
    assert match, 'Native bounds required'
    x, y, xx, yy = map(int, match.groups())
    assert 0 <= x < xx <= 720 and 0 <= y < yy <= 1280, 'Visible native control required'
    return ((x + xx) // 2, (y + yy) // 2)


def draft_labels(tree, record, receipt, source_quantity):
    labels = {v for n in tree.iter('node') for v in [n.get('text'), n.get('content-desc')] if v}
    assert record in labels and f'{receipt}/{source_quantity}' in labels and 'Submit Dispatch' in labels, 'Bound review required'
    assert not labels.intersection({'Error', 'Confirm Submission', 'Dispatch Created Successfully!', 'Send OTP'}), 'Unexpected draft screen'
    return sorted(labels)
