# Bounded fictional-fixture runs

Read OPERATOR_INSTALL_NOTES.md and the backend UNATTENDED_FIXTURE.md first.
This harness is for an explicitly owned disposable fixture. A plan is executable
input, not a security boundary: inspect every command before using it. Never use
a pilot, production state, a physical device serial or real provider delivery.
A runner smoke check does not establish application acceptance.

The installation is paused for an operator-managed six-core VM change/reboot.
Follow [CPU_UPGRADE_RESUME.md](CPU_UPGRADE_RESUME.md) on explicit resume before
starting new diagnostics or a long plan. Existing failed ANR evidence is retained.

## Before preparing a long plan

1. Freeze the exact backend source plus declared local changes, mobile source,
   APK SHA-256/version, emulator identity/API, fixture identity/state, bridge and
   embedded certificate. Preserve these in a private source manifest. Hash the
   manifest, APK and a stable fixture identity file as plan bindings. Include
   helper scripts as extra bindings so changed automation cannot reuse evidence.
2. Complete invoice/native acceptance on that exact artifact. Check the actual
   PDF handoff; a VIEW intent handler alone is insufficient for the app's SEND
   flow. Record compatible reader version and its first-run permissions. On
   this disposable API30 image, verified Librera9.5.7/code7222 receives PDF SEND
   but needs explicit approval for manage-all-files storage permission. The
   operator approved that permission for this fictional-data emulator only;
   this is not authorization for another operator's phone or shared emulator.
3. Check certificate lifetime with prepare-emulator-fixture.mjs
   --check-certificate. WAREHOUSE_FIXTURE_MIN_VALID_HOURS must cover the planned
   run, setup and a safety margin. Compare the APK's embedded public certificate
   with the running bridge. Do not disable TLS validation.
4. Complete a short emulator readiness check: boot, app cold launch, controlled
   UI navigation, foreground/background and a known fictional read. Fail on
   ANR/crash, unauthorized/disconnected ADB, unexpected package or timeout.
   Read the actual last mCurrentFocus entry when dumpsys contains historical
   entries; an earlier matching app entry does not establish current focus.
   Do not automatically dismiss ANRs. A recovered manual session is not a clean
   unattended readiness pass. No-KVM availability is a resource limitation,
   not proof that every emulator failure has the same cause.
5. Review the per-case prerequisites and postconditions. Interrupted writes and
   two-instance authentication need their own guarded controls/second fixture;
   do not replace either case with link-offline or unauthenticated discovery.

## Verified viewer prerequisite on the disposable API30 emulator

The verified package is [Librera9.5.7-fdroid/code7222](https://f-droid.org/packages/com.foobnix.pro.pdf.reader/),
not9.6.17, which failed on this API30 image. Download only to private fixture
storage and compare the official F-Droid index metadata and signing certificate:

```bash
curl --fail --location https://f-droid.org/repo/com.foobnix.pro.pdf.reader_7222.apk \
  --output "$FIXTURE_PRIVATE/librera-7222.apk"
printf '%s  %s\n' \
  b43e0991b7e356231077013667a90420010754681cec55873342229ead610eb8 \
  "$FIXTURE_PRIVATE/librera-7222.apk" | sha256sum --check -
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs \
  "$FIXTURE_PRIVATE/librera-7222.apk"
adb -s "$SELECTED_EMULATOR" shell pm list packages com.foobnix.pro.pdf.reader
# Continue only if this package is absent in the explicitly owned emulator.
adb -s "$SELECTED_EMULATOR" install "$FIXTURE_PRIVATE/librera-7222.apk"
adb -s "$SELECTED_EMULATOR" shell cmd package query-activities --brief \
  -a android.intent.action.SEND -t application/pdf \
  -c android.intent.category.DEFAULT
```

Expected signer SHA-256:
`ea0d90df4dde7b9a9e8eaebe2e8aa47ed13f4df9d77aa64bc99c7ed309d2a84d`.
The APK size is99754068bytes. A hash/signature or handler mismatch is a blocker.
Never overwrite an existing operator reader merely to obtain this version.

Launch the reader once. Its YES prompt opens Android's All files access screen.
This reader needs broad shared-storage access to copy a shared PDF into its
Download/Librera directory. Grant only with explicit approval for the disposable
emulator. This exercise received that approval after automatic review initially
rejected the permission; the initial denial and EACCES attempt remain recorded.
Another operator may instead choose and verify a narrower compatible PDF SEND
reader. The permission is not required by the warehouse app itself.

Return to the warehouse app, use Share PDF, choose Librera FD and Scroll mode.
Verify the displayed invoice number, totals and line parameters against the
saved record; installation/handler discovery alone is insufficient. Preserve
private screenshots and, when checking an export, its hash/text. Do not select
printing, Bluetooth or an external delivery destination in this exercise.
Final code3010 native share/render and reader-copy reconciliation PASS527–529.

## Private plan and evidence

Node22 and Linux are required. Put plan/evidence outside Git; own the directory
with mode0700 and plan mode0600. Commands use an absolute executable and cwd,
argv arrays (no implicit shell) and a1..3600-second timeout. Put credentials in
protected files, never argv. Child stdout/stderr stay in mode0600 logs.
Exit0 means the command passed; exit2 means BLOCKED; other exits mean FAIL.
Helpers must assert the expected outcome and return nonzero for skipped or
missing cases. A command that silently skips cannot establish acceptance.

Example schema (replace placeholders, including real SHA-256 values, locally):

```json
{
  "schema": 1,
  "scope": "isolated-fictional-fixture",
  "bindings": [
    {"path": "/private/fixture.apk", "sha256": "APK_SHA256"},
    {"path": "/private/source-manifest.json", "sha256": "MANIFEST_SHA256"},
    {"path": "/private/fixture-identity.json", "sha256": "IDENTITY_SHA256"}
  ],
  "preflight": [{
    "cwd": "/absolute/owned/checkout",
    "argv": ["/absolute/node", "/private/read-only-preflight.mjs"],
    "timeoutSeconds": 90
  }],
  "steps": [{
    "id": "receipt-case",
    "run": {
      "cwd": "/absolute/owned/checkout",
      "argv": ["/absolute/node", "/private/receipt-case.mjs"],
      "timeoutSeconds": 120
    },
    "verify": {
      "cwd": "/absolute/owned/checkout",
      "argv": ["/absolute/node", "/private/read-only-receipt-postcondition.mjs"],
      "timeoutSeconds": 60
    }
  }]
}
```

Implement the read-only preflight using the unchanged backend fixture ownership
validator, local health, exact installed artifact/routing/CA checks, disk/resource
budget and controlled-emulator checks. It runs before the plan and each case.
For a backend-only plan omit Android cases and label its scope honestly. Keep
preflight and verify commands read-only and bounded; do not launch background
services from them. Verification must remain meaningful after later steps.
The harness does not invent business cases or provide a complete overnight plan.

```bash
node scripts/run-fixture-plan.mjs /private/plan.json /private/run-evidence
# Only after reviewing the saved ledger and preserving the same bound inputs:
node scripts/run-fixture-plan.mjs /private/plan.json /private/run-evidence --resume
```

The runner binds the exact plan and input hashes, locks its evidence directory,
records RUNNING before a write and stops on FAIL, BLOCKED, timeout or failed
postcondition. It limits the sum of command timeouts to24hours. OS/process-launch
failure or abrupt host loss may leave a RUNNING record/lock; that is not PASS.

Resume rechecks prior successful postconditions and evidence hashes without
repeating successful writes. A failed/interrupted write is refused on resume:
inspect whether it committed, preserve the old ledger, and create a separately
reviewed corrective plan with fresh evidence. Do not edit the old result to PASS
or delete its logs. A stale lock requires confirming the recorded process and
its children are stopped before removing that specific lock. Never automatically
remove a lock or globally kill ADB/emulators to resume. Previously passed cases
remain historical evidence, not new test executions.

## Current gate status

The runner's regression tests cover successful resume without a repeated write,
changed bindings/plan/evidence/postconditions, FAIL/BLOCKED dependency stop,
timeouts, interrupted writes, failed preflight, private permissions and locking.
These checks are infrastructure evidence only. The complete long native plan,
current device stability, external PDF handoff, fault injection and second
fixture remain separate gates until their own evidence is recorded. Preserve
line-level versus header semantics: line amounts/taxes can sum differently
from the independently ceiled saved header. Discounts and header rounding
must not be inferred as storage charges or counted twice.
