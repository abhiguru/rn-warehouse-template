"""Strict controls and ownership-aware networking for an owned API30 fixture."""
import re

ALLOWED = {'Change Warehouse Server', 'Change warehouse server', 'Check server',
           'Use this server', 'CHANGE SERVER', 'CANCEL', 'Refresh orders', 'Orders tab'}

def point(tree, label, editable=False):
    assert label == 'Server origin' if editable else label in ALLOWED
    nodes = [n for n in tree.iter('node') if label in [n.get('text'), n.get('content-desc')]]
    if not editable and label in {'Change Warehouse Server', 'Change warehouse server', 'Check server', 'Use this server', 'CHANGE SERVER', 'CANCEL'}:
        nodes = [n for n in nodes if n.get('class') == 'android.widget.Button']
    assert len(nodes) == 1, 'Exact unique navigation control required'
    n = nodes[0]
    assert n.get('enabled') == 'true'
    assert (n.get('class') == 'android.widget.EditText') == editable
    m = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', n.get('bounds', ''))
    assert m
    x, y, xx, yy = map(int, m.groups())
    assert 0 <= x < xx <= 720 and 0 <= y < yy <= 1280
    return (x+xx)//2, (y+yy)//2

def routes(output):
    return [line.split() for line in output.splitlines() if 'tcp:443' in line.split()]

def route_absent(output):
    assert routes(output) == [], 'Do not overwrite an occupied reverse route'

def settings(adb):
    values = {name: adb('shell', 'settings', 'get', 'global', name)
              for name in ['wifi_on', 'mobile_data']}
    assert set(values.values()) <= {'0', '1'}, 'Known emulator radio settings required'
    assert '1' in values.values(), 'Start connected before an offline case'
    return values

def inputs(original, port):
    assert port in {18443, 18643}, 'Only owned fictional primary routes allowed'
    assert set(original) == {'wifi_on', 'mobile_data'}
    assert set(original.values()) <= {'0', '1'} and '1' in original.values()

def disconnect(adb, original, port):
    from dispatch_case_controls import owned_reverse_route
    inputs(original, port)
    owned_reverse_route(adb('reverse', '--list'), port)
    for name, value in original.items():
        assert adb('shell', 'settings', 'get', 'global', name) == value, 'Radio ownership changed'
    # The caller journals original settings before invoking this function.
    adb('shell', 'svc', 'wifi', 'disable')
    adb('shell', 'svc', 'data', 'disable')
    adb('reverse', '--remove', 'tcp:443')
    route_absent(adb('reverse', '--list'))
    for name in original:
        assert adb('shell', 'settings', 'get', 'global', name) == '0'

def reconnect(adb, original, port):
    from dispatch_case_controls import owned_reverse_route
    inputs(original, port)
    route_absent(adb('reverse', '--list'))
    for name in original:
        assert adb('shell', 'settings', 'get', 'global', name) == '0', 'Radio ownership changed'
    adb('reverse', 'tcp:443', 'tcp:' + str(port))
    owned_reverse_route(adb('reverse', '--list'), port)
    for name, service in [('wifi_on', 'wifi'), ('mobile_data', 'data')]:
        adb('shell', 'svc', service, 'enable' if original[name] == '1' else 'disable')
    for name in original:
        assert adb('shell', 'settings', 'get', 'global', name) == original[name]
