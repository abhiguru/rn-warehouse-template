# Current VM campaign

The active VM-only campaign and newer artifact results are recorded in
[the campaign checkpoint](OPERATOR_VM_ACCEPTANCE_20261001.md). The tables below
retain the earlier installed-artifact history; they do not describe the current
fictional fixtures or transfer the old soak PASS to new APKs.

# Historical operator acceptance checkpoint — 2026-10-01

This dated index separates source, API, emulator and physical evidence. Consult
the private soak ledger for live progress. Preserve all failed attempts in
[installation notes](OPERATOR_INSTALL_NOTES.md). Repeat a PASS only when its
source/configuration/artifact changes, an unresolved failure or a required new
scope justifies it. Successful compilation is not end-to-end acceptance.

## Exact sources and installed artifacts

| Role | Source / modifications |
| --- | --- |
| Requested/installed Test1 backend | `f18f51d4625e7f8c0d977ac69645804e318a9d49`; clean tracked source, public permission metadata corrected. Own private `warehouse-state/test1-install2`, loopback18000 and dedicated `test1.gurucold.in` ingress. Later review fixes are not installed there |
| Requested mobile candidate | `8240cce9121a797fd0cf2e00e568a61985814ddb`; PR33/codex/operator-mobile, not main |
| Active primary backend fixture | `7e3f66a34bb729d80e25c6a4a0975f072c05d03a`; own `core-backend-test-2026100101` state, declared subnet10.233.245.0/24/loopback18080 overlay; separately owned switching fixture, no pilot use |
| Installed soak APK | Mobile `e217c1f2b22f74ea5aaabca5101c27aa166c5f68`; `in.gurucold.warehouse.fixture`, version0.1.0/code2026100101/x86_64; generated identity and restricted dual public-CA overlay, no private CA keys, test signer |
| Installed physical APK, unchanged | Mobile `8d9da8ecb3afb873422011cce4c6615b63163a88`; `in.gurucold.warehouse.test1`, code2026093001/arm64; SamsungSM-A346E/Android15/API35; serial private |
| New mobile code candidate | `2fbf238a270e9806ed055ddfab045b57eb926ab2`; GRN UUID link, dispatch labels/log correction, SDK check, switch confirmation/reset, network/banner races, replacement local cleanup and one-attempt query writes; source/driver preparation only, next APK NOT BUILT/INSTALLED |
| Backend review | Code `bed4eeee4a008073aa453c32da27cade50a32a2f`, subsequent docs `b401af6c87ef8f823c6ab3cc506c7ad20da5b0b2`; source leaf dependency correction/reviewed observer; no installed-runtime change |

Installed soak APK SHA256:
`238ba669f3e14e1e0ea6d0dd396b8766fe5ce1482eae48e264a9af2f95900ed0`.
Physical APK SHA256:
`969d4fba6f21b7940897fb67aa8d09174f9e33cf376c964f4798ff96b15c25d4`.

## Required evidence and next action

| Required case | Status | Evidence / scope | Remaining prerequisite |
| --- | --- | --- | --- |
| Host/sudo/Docker inventory, independent ingress, Test1 local/public doctor and identity | PASS | Original independent installation, backend ledger | Recheck health after relevant changes; no DNS/tunnel replay |
| Same-input setup preserves identity/config/admin/DB/documents | PASS | Test1 comparison; separate clean fixture628 preserves all13 file hashes | New installed source requires separate preservation evidence |
| Test1 admin/customerA SMS, pending enrollment, approval/login | PASS | Real Test1 operator-entered OTPs | Unchanged scoped evidence reusable; no unattended SMS |
| Permissions/receipt/inventory/cart/order/staff queue/partial-final dispatch/invoice/private PDFs | PASS | Recorded Test1 and guarded fictional API cases; backend ledger identifies each | API evidence does not close changed native workflows |
| Invalid quantities, retries, concurrent stock and reciprocal A/B isolation | PASS | Disposable API evidence; fictional billing950+48=998 | Native changed-artifact cases separate; never replay saved documents |
| Real installed reciprocal CustomerB login/isolation | BLOCKED | Third owned phone unavailable | Additional owned phone/authorized SMS; do not ask again |
| Clean primary backend installation and rerun | PASS |618/628, exact7e plus declared overlay | Revised backend code needs its own state; exact-head CI covers its separate disposable environment |
| Installed e217 build/audit/readback and selected-server round trip | PASS |620/621,623c; ordinary mock verifier;623a/b FAIL retained | New candidate needs its own audit/native checks |
| Installed e217 receipt before/after response loss with images | PASS |624 before303/after302; one commit/stock/cache; failed301 saved record retained | Reuse unchanged scope; no replay of successful numbers |
| Installed e217 saved invoice/private PDF view/export | PASS |626; new number20261005/tax9/discount-2.5/total182/three lines/hash | Older half-cent results stay on their own artifact |
| Fractional tax/discount/duration contract source | PASS | Existing arithmetic regressions/scoped native history | Distinguish header ceil/discount contract from summed line tax; production policy separate |
| Installed e217 stale Orders, cold launch/read readiness | PASS |622,629,633; actual Orders200 and bounded lifecycle/read evidence | New APK must verify affected behavior |
| Completed e217 eight-hour read/refresh soak | PASS |658: final15:48:30UTC/21:18:30IST;9blocks/21checks,28,804.866seconds/459cycles/9credential rotations, business reconciliation PASS | Scoped to e217/code2026100101; new artifact needs its own acceptance; historical3014 overnight FAIL retained |
| New cold identity/switch/network/banner/query-write source | PASS |652 full290;654 full295/45suites, typecheck, lint0errors/1463warnings; RED→GREEN retained | Mocked native boundaries/fake transports do not close native acceptance |
| Guarded session/write/navigation/offline driver preparation | PASS |637–643/653, setup77/refusals/pure controls; full empty-schema SQL657 PASS | Populated guarded-CLI/native/selectors/radios/cleanup NOT TESTED; new APK/private bindings |
| Current native direct partial dispatch before/after response loss | NOT TESTED | API625/historical native3012 do not close it | Prepared drivers, deployed reviewed observer, fresh reserved stock/documents |
| New native device-offline error/no replay/reconciled retry | NOT TESTED | Prepared Orders/no-image dispatch cases; response loss is separate | Actual disconnect/zero-write proof; preserve uncertain requests |
| New native same/cancel/confirm origin switching | NOT TESTED | Source649/652, guarded653 drivers | New APK/exact fictional session/two owned origins; confirm logout last |
| Native unsaved-form/active-mutation switching | NOT TESTED | Real-reducer source coverage; read-only cancellation is narrower | Supported UI draft setup; some forms reset on navigation |
| Same-origin replacement | BLOCKED | Local-only cleanup source PASS | Separate empty state/new identity/credentials, owned listener/routing |
| Disabled/revoked native session | NOT TESTED | Reserved637 driver prepared; older API/logout scope separate | Ordinary reserved enrollment/login and exact artifact/session |
| Naturally expired refresh session | BLOCKED | Seven-day expiry not yet reached | Wait for actual age; never alter clock/timestamp/TTL or bypass auth |
| Current normal physical APK/QR/Wi-Fi/cellular/noUSB/Metro | NOT TESTED | Earlier physical Wi-Fi/QR/login stays on8d/code3001; emulator uses ADB reverse | New normal artifact/selected phone, camera/cellular/owned OTP locally |
| Source CI/dependency correction | PASS | Backendbed4/b401 all7; completed mobile GRN/switch/network/SDK heads all4 | 2fb all4PASS; latest pre-checkpoint mobile802706 all4/backend3a434 all7PASS; debug build is not native acceptance |
| Installed-image security/release readiness | BLOCKED | Source audit correction does not close existing image/runtime gates | Authorized rebuilt-image acceptance; deferred research stays excluded |
| Recovery/printing/sensors/iPhone/alerts/rotation/image research | NOT TESTED | Explicitly excluded/closed | Separate authorized scope; no merge/release/cutover |

Completion658 supersedes earlier pending snapshots without erasing their history.
The completed soak is scoped to its exact old artifact. Reviewed GRN CI
[36854228659](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36854228659)
all4 PASS. Mobile network70c3073
[36871398156](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36871398156),
switch3dc2023 [36869482636](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36869482636),
SDK86bde05 [36867225316](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36867225316)
all4 PASS. Backendbed4
[36864729906](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/36864729906)
and docsb401
[36869491629](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/36869491629)
all7 PASS. Historical failed CI/installed attempts and skipped jobs remain recorded.

Next: release guard PASS; preserve completion658, prepare new fixture TLS/helper
lifetimes, build/audit the new candidate and execute freshly bound guarded cases
one at a time. A new artifact cannot inherit
the e217 soak. Source-check reproduction is separate from a complete new-candidate
installation/standalone acceptance claim, which requires fresh evidence.
