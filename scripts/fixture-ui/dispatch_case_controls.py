"""Pure gates for two deliberately bounded native submission attempts."""
import re


def submission_point(tree, label, record):
    assert label in {'Submit Dispatch', 'Submit', 'OK'}, 'Unsupported case action'
    labels = {v for n in tree.iter('node') for v in [n.get('text'), n.get('content-desc')] if v}
    if label == 'Submit':
        assert 'Confirm Submission' in labels
        assert f'You are about to create dispatch {record} with 1 item.\n\nThis will update stock levels. Continue?' in labels
    elif label == 'OK':
        assert 'Error' in labels
    else:
        assert record in labels and 'Confirm Submission' not in labels
    # Reuse strict unique/enabled/bounds validation without broadening draft taps.
    nodes = [n for n in tree.iter('node') if label in [n.get('text'), n.get('content-desc')]]
    assert len(nodes) == 1 and nodes[0].get('class') != 'android.widget.EditText'
    n = nodes[0]
    assert n.get('enabled') == 'true'
    m = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', n.get('bounds', ''))
    assert m
    x, y, xx, yy = map(int, m.groups())
    assert 0 <= x < xx <= 720 and 0 <= y < yy <= 1280
    return (x+xx)//2, (y+yy)//2


class Attempts:
    def __init__(self):
        self.count = 0
        self.loss_verified = False

    def authorize(self):
        assert self.count == 0 or (self.count == 1 and self.loss_verified), 'Reconcile before retry; never replay'
        self.count += 1

    def verified_loss(self):
        assert self.count == 1 and not self.loss_verified
        self.loss_verified = True


def owned_reverse_route(output, port):
    rows = [line.split() for line in output.splitlines() if 'tcp:443' in line.split()]
    assert len(rows) == 1 and len(rows[0]) == 3, 'One owned reverse route required'
    assert rows[0][1:] == ['tcp:443', 'tcp:' + str(port)], 'Reverse route ownership changed'
