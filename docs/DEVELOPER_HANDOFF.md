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
attempt, its installation findings and the current acceptance matrix.
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
