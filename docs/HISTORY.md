# History

This public repository starts from a squashed snapshot; two earlier phases
shaped it. The source-demo release `v0.2.2-demo` (2026-09-18) was a source-only
prerelease pair with the companion backend, accepted with fictional demo data on
an Android emulator, a physical Android 15 phone and an iPhone 15; its immutable
tag, the dated acceptance records (native, order live-update, local
production-readiness, verification ledgers) and the full pre-squash commit
history live in the private archive repository
`abhiguru/rn-warehouse-template-archive`. The 2026-09/10 operator pilot then
replaced the demo wiring with operator server selection, the identity gate and
the custom-JWT session model, and drove an eight-hour soak on a single operator
VM that passed on 2026-10-08; the fixture and soak harness, the native capture
helpers and the dated pilot evidence, all bound to that operator's identity and
VM layout, moved to the private `abhiguru/warehouse-pilot-tooling` repository.
Nothing in either private repository is needed to build, test or run this
template, and the historical device results there do not validate the current
code.
