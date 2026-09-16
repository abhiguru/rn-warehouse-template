# Resume verification — 2026-09-15

These local results apply to mobile `8f22fbd14ee93816e42c120eef91a689a2da98c7`
plus the preserved `fix/v021-verification` working changes, and backend
`bd4f1a66d9084da3d73dcfafd2627596230157a9`. They do not establish acceptance of
the immutable `v0.2.1-demo` source tags or physical devices.

## Observed automated results

| Check | Result |
| --- | --- |
| Mobile Jest, before the subsequent image/session fixes | 124 tests, 12 suites passed |
| Mobile typecheck | Passed before the subsequent fixes |
| Mobile lint | Zero errors; 1,478 warnings before the subsequent fixes |
| Setup regression files | Five passed |
| Online Expo dependency compatibility | Passed |
| Android JavaScript export | Passed; this is not a native compilation result |
| npm audit | Zero vulnerabilities at the time of the run |
| Gitleaks working tree and 16 commits | No leaks found before the subsequent fixes |
| Mobile doctor and bootstrap connectivity | Passed |
| Backend unit tests | 16 passed with local network access |
| Mobile/backend contract | 93 RPC names, 127 typed calls, no mismatches |
| Disposable migration/auth/seed reruns | Passed; existing review database untouched |
| Backend doctor | Ownership, health, and bootstrap passed |
| Backend demo API suite | Passed, including role/customer isolation, stock, invoices, images, four PDFs, orders, refresh replay, and logout revocation |

## Native observations and open findings

- Restored the existing Android emulator using dedicated ADB port 5039 and
  serial `127.0.0.1:5581`, Metro port 28081, and backend port 28000.
- Fresh fictional admin login succeeded and the GRN list opened.
- Force-stop/reopen then returned to the empty login form. GLM vision confirmed
  this in local evidence `native-evidence/resume-evening-force-reopen.png`.
  Session restoration is an unresolved acceptance failure pending a fix/retest.
- GLM identified a startup redirect race and two image reads that stripped the
  absolute URI scheme required by Expo's File API. Fixes need final validation.
- Existing A0001 creation and GRN PDF sharing evidence comes from the earlier
  handoff. No duplicate A0001 was created during this continuation.
- Two independent GLM review attempts timed out; review is not yet satisfied.

## Remaining gates

Final-tree tests and independent review remain required. Native dispatch,
customer stock/cart, remaining dispatch, invoices/PDFs, logout/account switching,
and network recovery are unfinished. Physical Android, iOS, and physical-camera
acceptance require separate evidence. Raw logs, screenshots, credentials, and
native artifacts remain local. No tag or release asset was changed.
