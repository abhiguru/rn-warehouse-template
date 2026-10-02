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
