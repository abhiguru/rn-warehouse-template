# Independent operator mobile handoff

The current app selects an operator's canonical HTTPS origin before login.
Manual entry and QR discovery show the warehouse identity. Credentials, pending
enrollment and business state belong to one selected instance; a server switch
or replacement instance requires a fresh login.

Use the backend [operator installation guide](https://github.com/abhiguru/supabase-warehouse-template/blob/f18f51d4625e7f8c0d977ac69645804e318a9d49/docs/OPERATOR_INSTALL.md)
for the VM, MSG91 settings and local first-administrator bootstrap. The backend
[acceptance ledger](https://github.com/abhiguru/supabase-warehouse-template/blob/f18f51d4625e7f8c0d977ac69645804e318a9d49/docs/PRODUCTION_DEPENDENCIES.md#independent-operator-installation-work)
is authoritative for unfinished software and service/device acceptance.

Mobile implementation is under draft [mobile PR #33](https://github.com/abhiguru/rn-warehouse-template/pull/33)
and backend [PR #68](https://github.com/abhiguru/supabase-warehouse-template/pull/68)
merged at `f18f51d4625e7f8c0d977ac69645804e318a9d49`. Mobile candidate is
`8240cce9121a797fd0cf2e00e568a61985814ddb`; do not assume it is on mobile `main`.
See [OPERATOR_INSTALL_NOTES.md](OPERATOR_INSTALL_NOTES.md) for this fresh VM
attempt and installation findings. The [dated acceptance matrix](OPERATOR_ACCEPTANCE_MATRIX.md)
separates installed artifacts, newer source fixes, required cases and blockers;
consult the private soak ledger for live progress.
Record exact backend/mobile commits and native build IDs for every VM or physical
device acceptance run. Source checks and an Android artifact audit do not prove
real SMS, iPhone, lifecycle recovery or server-switch isolation on a device.

The next native acceptance uses the new VM's origin: administrator SMS login,
pending customer signup, administrator approval and customer login; core business
flows; Wi-Fi/cellular access; sign-out, cold restoration and two-server switching.
Retest delayed responses, active mutations, QR selection and a replacement
instance at the same URL on Android and a physical iPhone.

Printing and sensors remain disabled until their own acceptance. Native store
publication is separate from the pilot. Do not copy backend service credentials
into the app. `EXPO_PUBLIC_CONFIG_API_URL` is only for CLI configuration checks;
the running app uses the selected server.

[Historical source-demo handoff](SOURCE_DEMO_DEVELOPER_HANDOFF.md) and
[NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md) retain the original tested commits
and device identifiers. Those results do not validate the changed operator
runtime. Preserve `v0.2.2-demo`.

For work after the current isolated soak, use the [next acceptance plan](OPERATOR_NEXT_ACCEPTANCE.md). It distinguishes the source-only GRN-link fix from the installed artifact and lists the remaining native/hardware blockers.

The [post-soak session drivers](OPERATOR_SESSION_CASES.md) have passing guard/refusal checks; live/native acceptance and reserved-account preparation remain pending. The exact GRN-fix CI run36854228659 completed with all4 jobs PASS; later tooling-head CI and new-artifact native acceptance remain separate.

See [post-soak write retry cases](OPERATOR_WRITE_RETRY_CASES.md) for preparation638 and the small retry-observation blocker to close before unattended writes. No active-soak infrastructure was changed.

The dispatch draft-only driver641 and read-only adapter640 are documented in [write retry cases](OPERATOR_WRITE_RETRY_CASES.md). They have source and active-run refusal evidence, not current native acceptance. Include the three dispatch accessibility labels in the next audited APK; never replay existing fault documents.

Before Android compilation run `node scripts/check-android-sdk.mjs` after installing the pinned packages in [operator notes](OPERATOR_INSTALL_NOTES.md). CI now performs this explicit prerequisite step; SDK archive/download failures remain separate from app compilation/native acceptance.

Correction649 adds confirmation before switching warehouses and clears dispatch
rollback/error state on full reset. Eleven new source regressions pass; the
[server-switch cases](OPERATOR_SERVER_SWITCH_CASES.md) still require a new audited
APK and exclusive fixtures after the soak. Historical round-trip evidence does
not establish unsaved-form cancellation or same-origin replacement acceptance.

Corrections650–651 guard initial network-state ordering and stale offline-banner
animation callbacks. Combined source validation:281Jest tests/43suites,
typecheck and lint0errors PASS. The [offline/reconnect cases](OPERATOR_OFFLINE_CASES.md)
separate device disconnection, backend outage and explicit write retries; no
durable offline GRN/dispatch queue or new native result is claimed.

Preparation653 adds [guarded navigation/offline drivers](OPERATOR_NAVIGATION_DRIVERS.md).
Four active-run refusals and setup75PASS; full-schema/native execution remains open.
Cold-start identity correction652 has290Jest tests PASS; replacement authentication
on a new audited native artifact still needs separately owned replacement state.

Correction654 makes query-based writes one attempt per explicit action and avoids
paused reconnect execution. Five real-client regressions PASS; full295Jest tests,
typecheck and lint0errors PASS. The unused dispatch-delete hook is hardened;
current direct document services and installed soak APK are unchanged.
