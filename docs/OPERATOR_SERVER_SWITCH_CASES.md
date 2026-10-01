# Warehouse switching acceptance

Correction649 adds confirmation before discarding local state when a warehouse
changes and clears dispatch rollback data on full reset. Source tests pass;
native acceptance below is **NOT TESTED** on this correction. Historical normal
round-trip623c applies to its older APK and does not cover these cases.

## Prerequisites

Wait for the active soak to release the emulator and fixtures; require its final
reconciliation, not merely a stopped unit. Build/audit/install a new APK containing
649 plus the GRN/link/accessibility fixes under the
[operator build instructions](OPERATOR_INSTALL_NOTES.md#reproducible-local-standalone-test-apk).
Record the exact source pair, local overlays, APK hash/build ID and emulator OS.
Use only the owned fictional core/switch fixtures and ordinary fixture
authentication. Never use the live pilot or reuse another instance's credentials.

Changing to a replacement identity at the same origin needs a third, separately
owned empty state with new credentials and identity. Verify listener/route
ownership before temporary routing, preserve the old instance and restore only
the owned route afterward. This remains a setup blocker; two different origins
do not establish same-origin replacement. Do not fabricate an identity response
or change database/session timestamps to obtain a pass.

## Cases to execute once per affected artifact

Prepare fictional unsaved GRN, dispatch, invoice and customer drafts through the
supported UI. Record which drafts survive navigation before claiming the switch
preserves or clears them; some forms reset on unmount. Do not submit documents
merely to create these drafts. In-memory rollback reset is covered separately by
the real-reducer regression; native screens do not expose a rollback test command.

| Case | Expected behavior | Current evidence |
| --- | --- | --- |
| Check a different server, then Cancel confirmation | Identity is displayed; confirmation explains logout and draft loss; old session and retained drafts remain; no destination commit | Source PASS; native NOT TESTED |
| Confirm a different origin | All old drafts/caches cleared, new identity displayed, fresh login required; no old data after cold launch | Source PASS with mocked credentials/cache calls; native NOT TESTED |
| Select the same origin and instance | No destructive confirmation/logout; existing session and drafts preserved | Source PASS; native NOT TESTED |
| Confirm a new instance at the same origin | Same cleanup and fresh-login requirements as a different origin | Source PASS; native BLOCKED pending separately provisioned replacement |
| Save already in progress when confirming | Switch refused; original mutation allowed to finish and reconciled; no blind retry | Source PASS for both mutation gates; native NOT TESTED |
| Discovery fails or staging storage fails | Existing server/session/drafts remain; actionable error; no silent switch | Staging source PASS; discovery validation has separate unit coverage; native NOT TESTED |
| Cancel by leaving the selection screen | Old callback cannot activate a warehouse after unmount | Source PASS; native NOT TESTED |
| Switch back and cold launch | Correct identity, fresh authentication where required, no cross-instance cached data | Historical623c only; new artifact NOT TESTED |

Keep protected session/database comparisons, screenshots and device identifiers
outside Git. Record PASS/FAIL/BLOCKED/NOT TESTED with the exact case/artifact.
Do not reinterpret compilation, mocked logout or emulator evidence as real SMS,
physical phone, cellular or production acceptance. Preserve failures and saved
transactions; return to the normal owned route and check read health afterward.
