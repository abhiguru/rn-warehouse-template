# Guarded ordinary native fixture authentication

`scripts/fixture-ui/auth-api30.py` performs one ordinary mocked-delivery login on
an owned API30 emulator. It never retries OTP requests, changes counters, mints
sessions directly, dismisses ANRs or uses a fixed code. Authentication plaintext
stays in private IPC and ADB stdin; it is never an argument or logged response.

Prepare a private case JSON with scope `isolated-fictional-native-authentication`,
`soakConfig`, unused `caseDirectory`, the completed-soak release fields described
in OPERATOR_SESSION_CASES, exact fictional `origin`, allowlisted `phone`,
`profileName`, `role`, `expected` (`authenticated` or `pending`), `otpSocket` and
SHA256 `fixtureGuardSHA256` from the owning core/switch guard. The UI config must
bind the audited APK, new private emulator metadata, current managed helper units
and private results directory. Preserve all historical frozen metadata.

The observer checks actual release and original fixture ownership before ADB,
SQL or attempt creation. Before requesting a code it reads effective existing
hour/day quotas. The UI driver checks installed bytes, API30, SELinux, active
helpers, crashes/ANRs and unique visible controls. The phone field compares exact
normalized digits because PhoneInput formats its display with spaces. Other
fields retain exact comparison. The OTP focus step is explicitly the previously
measured 720x1280 API30 code-row coordinate; numeric target-app IME and the
bound fictional phone must match before reading IPC. Other devices are refused.

```sh
timeout --signal=TERM --kill-after=10s 10m \
  python3 scripts/fixture-ui/auth-api30.py /absolute/private/auth-case.json
```

Successful authenticated acceptance needs one new independently observed native
session, exactly one newly verified OTP, the intended active role/profile and an
unchanged business/Storage metadata digest. Session IDs/expiry and raw phone values
remain private. Cold persistence, switching, customer isolation, rejection and
revocation need their separate native cases. Pending mode is prepared and has not
been executed in this campaign; it does not grant approval or fabricate a name.

Current VM campaign: ordinary core administrator login passed on candidate
2fb/code2026100102 after one preserved zero-OTP driver failure caused by formatted
phone comparison. Six selector tests and an actual wrong-completed-plan refusal
passed; the sentinel ADB and attempt directory remained untouched. No completed
new-candidate soak is claimed. Private evidence is under the campaign directory.
