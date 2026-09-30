# Resume after the operator assigns six CPU cores

## Paused checkpoint — 2026-09-30

The operator requested documentation, commit/push and a pause before assigning
six total CPU cores to this VM and rebooting it. No reboot or VMware setting
change was performed by the installation agent. The interrupted diagnostic turn
performed inventory and read existing evidence; a new emulator diagnostic had
not started. No overnight run or timer is active.

At pause, Ubuntu24.04.3 x86_64 VMware exposes two CPUs,17GiB RAM and77GiB free
disk. Test1's loopback18000 gateway and dedicated tunnel are active. The owned
fixture03, bridge and emulator are stopped;18080/18443/5556/5557 and the private
fixture IPC socket are absent. Fixture04 is also retained stopped. Persistent
warehouse state, AVDs, APKs, protected inputs, signing material and raw evidence
remain outside Git. Reuse them; do not delete or recreate the installed warehouse.
Private checkpoint paths and hashes are in the operator's protected resume file.

Installed Test1 backend remains
`f18f51d4625e7f8c0d977ac69645804e318a9d49`, with source content unchanged.
Current fixture03 backend actually uses
`c0a6db16a8e6ff23d56a8563703231b2f76b5da4` plus its declared bridge-boundary patch
identical to reviewedee5b493 and isolated subnet10.233.245/24. Its owning checkout
and state must be verified before any fixture start or test mutation.

The retained, installed emulator APK is version2026093010/x86_64, source
`57add4456cf47465771e3962f041928f8d6029d7`, SHA-256
`c642950d24922b89119b9dacf91e0565a04f75f47e83bb3d286af07d12457676`.
Current tested tooling pin is
`b22c3b5ad72f41e9ea936d987aee6b027459ca0e`; its app/config/dependency files match
the built57 source. Main instructions show a clean new build3011, which has not
yet been performed. Later review documentation commits are not installed app
sources. Read OPERATOR_INSTALL_NOTES.md for exact artifact-scoped results.

Invoice239Jest/type/lint,42setup checks, runner regressions, guarded read-only
runner/resume smoke, native invoice/PDF correction and approved local reader
checks have already passed to their recorded scopes. Reuse that evidence unless
inputs or relevant behavior change. First cold launch still failed with SystemUI
ANR; one diagnostic Wait recovery did not close unattended readiness. The exact
ANR cause is not established. Google lists accelerated emulators inside another
VM as unsupported in its [acceleration guidance](https://developer.android.com/studio/run/emulator-acceleration).
Additional CPU capacity is a software-performance experiment, not proof of KVM
availability or a guaranteed ANR fix.

## Ordered work after explicit resume

1. Refresh host inventory and compare the saved boot ID privately. Verify six
   guest CPUs with nproc/lscpu, memory/disk, effective noninteractive sudo, pinned
   Node22/npm, Docker/Compose/access and current virtualization flags /dev/kvm.
   Do not assume the CPU change also enabled hardware virtualization. The previous
   inventory had no vmx/svm or KVM. Preserve new inventory privately.
2. Verify the installed Test1 source, private state/configuration fingerprints,
   Docker services and dedicated tunnel. Run its local/public doctor and identity
   discovery to establish post-reboot health. Ordinary commands are in the
   backend installation guide and the private handoff. If it fails, preserve the
   error and fix this instance only before starting optional fixture work.
3. Reconfirm exact source/artifact hashes, private state ownership and disposable
   port/socket vacancy. Check certificate horizon before restarting the fixture
   bridge or planning a long run. Current fixture CA expires
   2026-10-01T09:51:45Z. If insufficient for preparation/run/margin, issue new private
   fixture TLS, build/audit/install its matching APK and record a fresh build ID.
   Retain the old artifact/evidence; never bypass TLS.
4. Begin the bounded emulator diagnostic. Leave heavy compilation and optional
   fixture services stopped for the first OS-startup observation. The saved
   launcher uses -cores2. Retain that value for the first six-host-core comparison
   so the changed resource is clear; record a separate -cores4 trial only if
   needed. Do not automatically configure six emulated cores on the six-core VM.
   Record emulator37.1.11/API30/default x86_64, software rendering and exact args.
   Capture host load and Android event/logcat/ANR traces privately before launching
   the warehouse app. Boot-completed alone is insufficient; check the actual last
   current-focus entry and detect any system/app ANR without dismissing it.
5. If OS startup is clean, ownership-check and start fixture03 and its loopback
   bridge. Reapply only the owned emulator's hosts binding and ADB reverse after
   each cold boot, preserving SELinux Enforcing. Verify the retained installed
   APK bytes/version rather than reinstalling an unchanged APK. No physical phone,
   real OTP or production pilot is used by this diagnostic.
6. Establish readiness with the proposed minimum of three consecutive clean app
   cold launches plus a30-minute unattended smoke: controlled navigation, known
   fictional reads and background/foreground, with no ANR dismissal, ADB restart
   or manual intervention. Treat this as a bounded prerequisite rehearsal; stop
   and preserve evidence on failure. A clean rehearsal is not overnight acceptance.
7. Reproduce the corrected build from a clean pinned checkout, audit/install the
   final chosen artifact and bind its source pair, local overlays, CA, identity,
   helper hashes and build identifier into the private test manifest. Complete
   the executable case plan with assertions, timeouts, dependencies, private logs
   and read-only postconditions. Revalidate the runner against those bindings;
   preserve successful case evidence and never automatically repeat a write after
   an interrupted attempt.
8. Prepare guarded before/after-commit fault controls and a separately owned second
   authenticated fictional fixture for dependent cases. Neither is implemented
   yet. Preserve the original core-fixture guard; use no pilot data/routes/tunnel.
   Mark unavailable cases BLOCKED rather than silently skipping or inventing PASS.
9. Perform the final owned-state/health/disk/CA/artifact/routing preflight and the
   bounded suite rehearsal. Launch an overnight run only when its exact scope and
   prerequisites are satisfied and recorded. Deferred/external gates stay open.

The backend dependency-security CI gate still fails at the explicitly deferred
container audit. Physical/current corrected-artifact acceptance, cellular/no-USB,
real CustomerB and other documented hardware/provider/recovery/release gates are
not closed by the CPU change. No merge, release, recovery rehearsal or production
readiness claim belongs to this resume procedure.
