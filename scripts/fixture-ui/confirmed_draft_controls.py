"""Counts only owned credential key names; never reads values into the harness."""
import re
import shlex
PACKAGE = 'in.gurucold.warehouse.fixture'
def credential_presence(adb):
    assert adb('shell', 'id', '-u') == '0'
    prefs = '/data/user/0/' + PACKAGE + '/shared_prefs/SecureStore.xml'
    # grep -q returns only a boolean marker. Both legacy and keychain-aware names
    # are checked; encrypted values are never returned, parsed or copied.
    keys = ['secure_auth_token', 'secure_refresh_token', 'secure_token_expires',
            'secure_enrollment_token', 'secure_operator_identity', 'cached_user_profile']
    pattern = 'name="(key_v1-)?(' + '|'.join(keys) + ')"'
    script = 'test -f ' + shlex.quote(prefs) + ' || exit 2; if grep -Eq ' + shlex.quote(pattern) + ' ' + shlex.quote(prefs) + '; then echo PRESENT; else rc=$?; test "$rc" = 1 || exit 3; echo ABSENT; fi'
    value = adb('shell', 'sh', '-c', shlex.quote(script))
    assert value in ['PRESENT', 'ABSENT'], 'Bounded credential-key observation required'
    database = '/data/user/0/' + PACKAGE + '/databases/RKStorage'
    query = "SELECT count(*) FROM catalystLocalStorage WHERE key IN ('auth_token','refresh_token','token_expires_at','cached_user_profile','session_marker','secure_session_marker','operator_server_staged_v1');"
    legacy = adb('shell', shlex.join(['/system/bin/sqlite3', '-readonly', database, query]))
    assert re.fullmatch(r'\d{1,3}', legacy)
    return value == 'PRESENT' or int(legacy) != 0


def read_refusal_acknowledgement(tree):
    import re
    labels={n.get('text') for n in tree.iter('node')}
    assert 'Operation In Progress' in labels and 'Finish the current operation before switching servers.' in labels,'Exact owned read-refusal alert required'
    nodes=[n for n in tree.iter('node') if n.get('text')=='OK' and n.get('class')=='android.widget.Button']
    assert len(nodes)==1 and nodes[0].get('enabled')=='true'
    m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',nodes[0].get('bounds',''));assert m
    x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
    return (x+xx)//2,(y+yy)//2
