# VM-only acceptance campaign, 1 October 2026

This campaign remains in progress. It uses the existing x86_64 VM and the owned API30 emulator only. Its 48-hour deadline is 3 October 2026 at 16:27:13 UTC. There is no ARM build, physical-device acceptance, production contact, real SMS, restore, release or merge.

The completed eight-hour soak belongs exclusively to the older APK, build 2026100101. Its immutable plan, 54 bound inputs and PASS ledger remain preserved. None of its acceptance transfers to a later APK. The final new-artifact soak has **not started**; unresolved native writes and missing acceptance cases still block its gates.

## Current APK10 checkpoint, 2 October 21:36 UTC

Installed x86_64 build `2026100110` remains application source
`c422f62cd36cb407e7ed7bfce28c4db5189e2bd5`, SHA256
`a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69`.
Newer fixture tooling and documentation do not change those application bytes.
The exact private proof catalog `requirements-evidence-checkpoint-20261002T2136.json`
records inspected proof digests and statuses, including the preserved FAIL.

| Requirement | Current evidence and remaining gate |
| --- | --- |
| Clean backend and independent fixtures | Existing pinned installation/reproduction evidence and four independent identities remain preserved. Application `bed4eeee` plus declared overlays; fixture tooling recorded separately. |
| APK10 build/install | Compiled audit, signer/trust/ABI/standalone bundle and installed hash PASS. Final acceptance freeze is not declared. |
| Native invalid receipt quantities | APK10 PASS for literal 0, -1 and 1.5, disabled item Save and unchanged protected SQL/stored bytes; no positive receipt/image claim. |
| Historical queue, PDFs, Realtime, draft cancellation and dispatch admission | Inspected PASS proofs remain scoped to APK9 and the exact tested workflows. They do not transfer to APK10. |
| Fresh race fixture | Ordinary API FXQ993 quantity/stock3 prepared once and reconciled, with only its new API session removed. This is not native receipt acceptance. |
| Native controlled concurrency | BLOCKED after three preserved attempts; no native submission or competitor write. Final preparation equality FAIL is retained; separate SQL diagnosis proves legitimate native refresh rotation. No fourth run. |
| Lost-response/offline writes, positive native receipt/cart/image and selected invoice navigation | Existing attempt-limited FAIL/PARTIAL/BLOCKED results preserved with successful document numbers and stock. No alias/replay. |
| Confirmed switching during requests/uploads/saves | UNTESTED; cancellation and historical switching evidence do not prove these distinct cases. |
| Reserved revocation | UNSTARTED; dependent closure and ordinary customer-role/login prerequisites remain incomplete. |
| Normal-route cleanup | Fresh normal10 twelve-hour helper, actual TLS/IPC preflight, cold Orders HTTP200, exact unchanged-state cleanup PASS. This is health/cleanup evidence only. |
| Complete source tooling | Node22 mobile setup 271/271 and backend unit 97/97 PASS; redacted source/history scans PASS in both repositories. |
| Exact published CI | Mobile `ccd5c4e`, run37067496315: lint/types and scan PASS, dependencies FAIL, Android debug audit still live. Backend `33825bd`, run37067498320: six jobs PASS, isolated installation still live. Remote CI jobs do not establish physical or ARM acceptance. |
| Dependency gate | BLOCKED. The [primary node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv), rechecked now, still lists affected versions through1.4.0 and no patched version. No audit waiver or dependency substitution. |
| Final readiness/eight-hour soak | UNSTARTED; native and dependency gates remain unresolved. Older build0101 soak remains separate PASS. |
| Dedicated natural expiry | UNSCHEDULED; final freeze and a dedicated owned AVD/session are still required. Original native session is not an expiry appointment. |
| Hardware/provider/production acceptance | Explicitly deferred or excluded according to approved VM-only scope. No ARM build/device, physical camera/network/no-USB or production acceptance claim. |

## Historical APK9 evidence checkpoint, 2 October 19:13 UTC

The installed standalone x86_64 candidate is APK2026100109, application source
`696165f4a4494c8b5652e4e98965ad05d600d10e`, SHA256
`08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7`.
Application bytes remain separate from newer fixture tooling and documentation.
The backend application remains `bed4eeee4a008073aa453c32da27cade50a32a2f`
with recorded overlays; backend review head is `5e70e01`.

| Requirement | Current evidence and remaining scope |
| --- | --- |
| Exact APK9 audit | PASS; immutable compiled audit and installed read-back are retained. This is not final freeze/readiness. |
| B GRN PDF | PASS; genuine generation/download, Android SEND, approved Librera view/export and stored/native/export hashes. |
| Reciprocal customer Realtime | PASS; actual A/B/admin channels, native B event-driven refetch, both writes reconciled and only new API sessions removed. |
| Supervisor Realtime | PASS; explicit supervisor received both events; customer A only A; native supervisor refetched without manual refresh. |
| Unsaved draft cancellation | All four PASS: customer, invoice, GRN and dispatch. First GRN selector failure preserved/reconciled before corrected pass. Confirmed and in-flight switching remain distinct. |
| Native dispatch quantity admission | PASS for zero/excess21 against stock20; Save disabled, no item save/submission, all three SQL/object snapshots identical. First zero-rendering helper failure preserved. |
| B account lifecycle | PASS ordinary native logout, administrator rejection and native rejected-login denial; B remains rejected/logged out. |
| B image rendering | BLOCKED after three preserved/reconciled attempts. Independent private-image API denial PASS does not establish native rendering. |
| Native receipt/cart and selected invoice/lost-response cases | Attempt-limited failures and partial results remain preserved below. No alias or fourth attempt is allowed. Successful/uncertain document numbers and stock remain retained. |
| Native queue processing | PASS on corrected attempt02: one genuine queue dispatch, stock8 to6, matched line removed/order OPEN, native cold empty queue/Orders200, unrelated state preserved. API-created cart provenance remains explicit. |
| Remaining native business | Concurrency and receipt invalid quantities remain unexecuted; existing source/API checks do not establish their native acceptance. |
| Remaining switching | In-flight uploads/saves and confirmed request switching remain unexecuted. Older-artifact same/switch/replacement results retain their exact scope and do not transfer to APK9. |
| Reserved account revocation | UNSTARTED; current reserved native role is supervisor, and dependent workflow closure is incomplete. No unsupported role/session substitution is permitted. |
| Source verification | 253 setup tests PASS with documented fixture Node runtime; redacted source/history scans PASS. Unsupported Node18 failure remains retained. |
| Final readiness / eight-hour soak | UNSTARTED; dependency and remaining native gates unresolved. Older-APK soak remains separate PASS. |
| Dedicated natural expiry | UNSCHEDULED; requires final artifact freeze and a separate owned AVD/session. Current supervisor session is not this appointment. |

Private `requirements-audit-20261002T1913.json` binds the inspected artifact and
recent acceptance proofs. Runtime monitor reports owned API30 without ANR/crash
or resource pressure; disk remains below the25GiB new-native-build floor. No
state/cache deletion, build-floor waiver or final-completion claim is made.

The tables below are the initial campaign checkpoint and historical evidence;
subsequent dated results retain their exact artifact and attempt scopes.

## Initial source and artifact checkpoint

| Item | Recorded source or result |
| --- | --- |
| Clean backend application | `bed4eeee4a008073aa453c32da27cade50a32a2f` |
| Backend review documentation | `566b4281601f9b41417f6279cc4782f7334bd20b` |
| Original campaign mobile application | `2fbf238a270e9806ed055ddfab045b57eb926ab2` |
| Mobile application built as 2026100104 | `f07ed1bcdcf79ea418813e8d95f0eb695c7e1183` |
| APK0104 SHA-256 | `a83f8a05d1d2caf926fee2e36365747405a0716ddd637aea0d6847bccce66616` |
| Receipt layout correction awaiting native verification | `a43a3e1` |
| Native receipt driver tooling | `2eded2b` |
| Package / ABI | `in.gurucold.warehouse.fixture` / x86_64 |

Application changes and fixture tooling commits are recorded separately from generated native trust inputs. Every subsequent candidate needs its own compiled audit, increasing version code, install read-back and native evidence. Runtime tools are frozen in private directories; corrections belong in review source, followed by a new runtime and attempt.

## Initial executed results (historical)

| Scope | Result and limits |
| --- | --- |
| State preservation | Consistent private database/storage backups of both retired fictional stacks; checksum and archive catalogs passed. No restore claim. |
| Backend reproduction | Clean pinned installation, migrations, administrator, identity, local doctor and pinned HTTPS discovery passed on fresh disposable primary state. Repeat setup preserved credentials, identity, administrator, observed records and actual stored-object hashes. |
| Independent warehouses | Primary, switching and same-origin replacement installations passed ownership/identity checks. State, credentials and instance UUIDs are independent. Native replacement acceptance is pending. |
| Certificates and helpers | Three independent 14-day certificates restricted to exact fictional hosts; private keys retained locally. Supervised TLS/OTP/fault helpers passed real readiness; their existing 12-hour caps remain. |
| Backend API | Business workflows, invalid operations, concurrency, customer/staff isolation, private images/PDFs, authentication, Realtime, gateway, Studio/metadata, retention preview and bounded load smoke passed. Historical API helpers that issue sessions internally are labelled API evidence; new native logins use ordinary authentication. |
| APK0104 | Clean standalone release, compiled fictional trust, bundle, manifest/permission and signature audits, installed SHA read-back and preserved-session cold Orders read passed. Unit, lint, type, SDK/Expo, dependency and source scans passed. Metro was unnecessary at runtime. |
| Native server selection, APK0103 | Same-instance selection, different-instance cancellation, confirmed switch, ordinary destination login, reciprocal switch and ordinary return login passed. Independent SQL verified unchanged business data and revocation only of departing native sessions. Selected identities survived cold launch. These remain scoped to APK0103. |
| Native Orders offline, APK0102 | Android reported no active default network; stale/offline UI and absence of current successful RPC were observed. Owned radios/route were restored and a genuine current Orders read passed. New-artifact rerun remains separate. |
| Invoice API regression | Fractional tax, monthly duration boundaries, discount/surcharge and five saved invoices agreed with actual private PDF text. The native ₹178.50 versus ₹179 review/save case remains pending. |

## Preserved failures and blockers

The before-execution dispatch case exhausted its two corrected reruns during non-submitting preparation/confirmation. It is blocked; no fourth attempt or alias case is permitted. Independent reconciliation showed no committed operation.

The after-commit dispatch case produced a real native error and matching fault after exactly one quantity-three dispatch committed, reducing stock from 20 to 17 with one cached success. Reconciliation stopped on the source receipt's legitimate audit timestamp before any retry. A read-only reconstruction confirmed the cause and the observer was corrected for future cases. The successful document remains preserved; unchanged retry acceptance is **not established**.

The offline dispatch case exhausted its two corrected preparation reruns. It never submitted or reached device disconnection, and is blocked. No offline-write PASS is claimed.

The first native receipt draft on APK0104 stopped before submission: the item suggestions were clipped outside their horizontal scroll container, and Android reported inverted bounds. Independent database, stock and cache reconciliation found no commit or unrelated business change. The source correction uses inline suggestions for that receipt field and passed focused selection tests, lint and typecheck. Native verification on the next candidate remains pending; the failed attempt and reserved number remain preserved.

A prior terminal-owned emulator was killed by VM memory pressure while Metro used uncapped workers during a build. Its stopped state was privately archived, checksummed and catalogued before supervised restart. Exact installed bytes, retained session, owned routes and normal reads were reconciled. One initial read-back filename was accidentally reused; a separate evidence note records that limitation and the original base hosts remain in the restoration log and stopped-state archive. New builds cleanly stop the owned emulator and cap **both** Gradle and Metro to two workers.

## Reproduction and operation

Use [the build instructions](../README.md), [fixture preparation](OPERATOR_NEXT_ACCEPTANCE.md), [ordinary authentication driver](OPERATOR_AUTH_DRIVER.md), [server cases](OPERATOR_SERVER_SWITCH_CASES.md) and [write reconciliation](OPERATOR_WRITE_RETRY_CASES.md). The backend review's operator-install guide supplies the clean installation sequence; use fresh disposable state and only declared overlays.

Set `WAREHOUSE_FIXTURE_BUNDLE_WORKERS=2` for these fixture builds as well as Gradle's documented two-worker memory limits. Require 25 GiB free before a new native build. Preserve the cleanly stopped owned AVD state before building; never delete unrelated state or caches to meet the threshold. Start a fresh supervised emulator identity afterward and reconcile its installed bytes, fictional hosts, route and session before continuing.

Private evidence, state/configuration, plans, checksums, immutable tools, service identities and per-case logs remain under the campaign's owner-only local acceptance directory. They contain state and authentication evidence and are not transferred or committed. Read-only progress monitoring sends no external alerts. There is one native actor and one heavy build at a time.

Receipt/image/inventory, customer enrollment and permissions, order/queue, remaining dispatch, native invoice/PDF/Librera, replacement identity, unsaved and in-flight switching, Realtime/lifecycle, new-artifact offline cases and account revocation still require native evidence. The dedicated expiry AVD/session and expiry-plus-ten-minute appointment will be created only after the final APK freezes; no clock manipulation or authenticated-state cloning is allowed. Physical-device, provider, production-policy, recovery and deferred integration acceptance remain excluded.

The receipt inline-list correction subsequently passed native draft preparation on APK0105: exact item selection, quantity/weight input and review were observed, with unchanged database/stock/cache before submission. The outer runner's normal-route checkpoint then refused the intentionally held fault route before the submission step ran. Preparation and guarded fault/retry must therefore execute as one bounded orchestration unit, with normal-route checks surrounding that entire unit. Preserve this non-submitting attempt; it does not establish fault/retry acceptance.

The final permitted FXF501 attempt stopped at the application's **Image Required** dialog before confirmation or any backend request. The relay remained ARMED with no observations; cleanup preserved that evidence, disarmed it and restored the owned route. Independent receipt/stock/cache/business reconciliation and a normal-route cold read passed. FXF501 is now BLOCKED after two corrected reruns; no fourth attempt or alias before-execution receipt case is permitted. The image-free driver does not satisfy the application contract. Independent after-commit receipt work requires a real native deferred book attachment and separate confirmed image/object/byte reconciliation.

APK0105 (`a43a3e1`, SHA-256 `4a201b9446171924bcb95808ab1da064d1a4fce640de5cc80b2d547e0940d63f`) passed compiled audit, installed read-back, normal cold reads and 297 unit tests plus lint/type/SDK/Expo/dependency/source checks. Native malformed HTTP/path/query origins were rejected with their exact messages; the selected warehouse, ordinary session and business/auth baseline remained unchanged through a cold read. This remains scoped to APK0105 and does not claim a final freeze or soak.

## APK0105 and gallery checkpoint

The clean x86_64 release from application commit `a43a3e15500adcca6c65cebdab6f6ddde4f91311`, version code `2026100105`, has SHA-256 `4a201b9446171924bcb95808ab1da064d1a4fce640de5cc80b2d547e0940d63f`. Compiled trust/bundle/permissions/signer audits, installed read-back, 297 application tests, lint/typecheck, Expo/SDK, dependency and source checks passed. The receipt inline suggestion correction passed native item selection, quantity/weight entry and review. Malformed origins were rejected with exact native errors, preserving the chosen server, session and business baseline; cold Orders reads passed.

Receipt before-execution case FXF501 exhausted its two corrected reruns. The last attempt reached review but the existing mandatory book-image dialog stopped submission. No committed receipt or stock/cache change occurred. It remains blocked; the image requirement was preserved.

Separate after-commit receipt case FXF502 also exhausted its two corrected reruns before submission. The first stopped on a photo-label selector, the second at the fixture-only capture tool's DocumentsUI boundary, and the final corrected attempt opened the native picker and selected List view. Android DocumentsUI then crashed with `StaleDataException: Attempted to access a cursor after it has been closed`. No receipt request, fault arm, server image upload or retry occurred. Independent SQL and actual stored-file hashes confirmed unchanged receipt/stock/cache/business/storage state. This is a platform-picker blocker; receipt response-loss acceptance is not established.

Fixture tooling commit `448267f` adds a separate read-only, API30 DocumentsUI capture tool with exact class and local/device hash checks; the old frozen fixture capture remains unchanged. Its 38 native control tests and 86 setup tests passed. One synthetic PNG was imported through the owned emulator's media provider; its bytes, normal media ownership/context and picker presence were verified. MediaStore dimensions remained null, so native image decoding/rendering is not claimed.

A diagnostic invocation of a nonexistent capture JAR separately crashed `app_process` before its main class. Both that failure and the later DocumentsUI crash were preserved without clearing logs or dismissing an ANR. Each restart followed a clean owned-AVD stop and a checksummed, readable private state archive. Proven-owned fictional hosts and reverse routes were restored and cold reads verified; no host reboot, wipe or state restore occurred. The new-artifact soak remains unstarted.

The separate five-invoice native read stage exhausted its two corrected reruns. The final attempt cold-opened invoice 20261001 and verified total ₹147 and tax ₹7 in both its header and visible Breakdown rows. Its related-document link opened the correct IRP01 GRN by UUID, but the destination selected **Items**, rather than the required **Overview**. The native capture confirms the selected tab; independent snapshots confirm unchanged business/authentication data. The other four native invoice reads remain untested, and the stopped stage will not be resumed or rerun under an alias.

The source correction makes invoice GRN links request Overview explicitly and honors that entry in the GRN screen. Ordinary GRN entry still opens Items, manual tab changes persist on the same route, and a new linked GRN resets to the requested Overview. Eight focused component regressions, typecheck and lint passed. This correction is not present in APK0105 and has no compiled native PASS yet. Invoice review/save/confirmation, the ₹178.50-versus-₹179 trigger, PDF SEND/Librera and the final soak remain separate pending work.

## APK0106, genuine offline Orders and native PDF checkpoint

APK0106 is a clean x86_64 release from application commit `6fc20d45c2bcfebdf9bcb4cae66940bcea1212b6`, version code `2026100106`, SHA-256 `cfb15c409ba413b80e1599a909636d8251ec1cbe38ebff4d72e7e355234b25ac`. Compiled audit, installed read-back, 301 application tests, lint/typecheck, SDK/Expo, dependency and source checks passed. The GRN Overview source correction is compiled in this candidate; the exhausted five-invoice navigation case remains blocked and was not rerun. The emulator was cleanly stopped and its state archived before building with two workers.

Actual native Orders disconnection/reconnection passed after one preserved preparation failure. The corrected test required two Android observations of no active default network and a narrowly scoped temporary OUTPUT rejection for this fixture application's UID, loopback destination and TLS port. Cached/offline state, absence of a backend Orders call during disconnection, explicit reconnect and a new successful Orders read were observed. The owned airplane setting, radios, rule and normal reverse route were restored and independently checked. This establishes emulator disconnection evidence; rapid transitions and physical Wi-Fi/cellular acceptance remain pending.

One saved invoice passed native PDF generation/download, actual Android SEND, viewing in the originally approved Librera installation and its automatic local copy. Independent SQL and actual stored-file hashes showed exactly one new private PDF object, unchanged previous stored files and unchanged business/authentication records outside that expected object. Backend PDF bytes, app cache download and Librera's newly created Downloads/Librera copy have the same SHA-256. The one-page screenshot shows the expected customer, tax ₹7 and total ₹147; PDF text independently verifies invoice 20261001 and those values. No reader permissions or remembered mode were changed, and no printing or external target was selected.

The initial PDF preparation stopped after successful generation because the test wrongly expected the GRN number in the existing PDF layout. The failed attempt remains preserved. Corrected read-only checks reconciled that same PDF; it was not regenerated. Subsequent bounded stages selected Librera once and opened the existing document. This result is scoped to that saved invoice and APK0106; unauthorized PDF denial, other native invoice arithmetic/save cases and the final soak remain separate.

Read-only monitoring now checks ledger progress, bound files, emulator crashes/ANRs, resources and certificate/helper lifetime without external alerts. Seventeen historical bindings to editable review sources changed after their finished attempts; all mismatches remain recorded, and six exact historical source versions were recovered from Git into private immutable evidence. No old plan was edited or resumed. Current frozen inputs and the 54 older-soak bindings remain unchanged.

The campaign is incomplete. The new-artifact eight-hour soak is unstarted, final artifact freeze is not declared, and the dedicated natural-expiry appointment still awaits that freeze. Preserved write/navigation blockers and remaining independent native workflows are listed in the private acceptance matrix. Tooling changes after `6fc20d4` do not alter installed APK0106.

The separate IRN01 ₹178.50-versus-₹179 native save case is **PARTIAL_BLOCKED** after its two corrected reruns. Initial attempts stopped before submission on duplicate native labels. The final attempt verified review storage ₹150, labour ₹20, rounded tax ₹9 and total ₹179, then the confirmation's ₹179.00 and native saved-success total. Exactly one ordinary submission committed invoice 20261010 with three expected lines; independent SQL reconciled total ₹179, tax ₹9, raw line tax ₹8.50, quantities, durations and unchanged unrelated business/authentication data. Its GRN acquired only the expected invoiced/audit changes. The successful invoice and all attempt evidence are preserved.

The final driver then refused the success dialog's parent/child **View Invoice List** label because their nested bounds differ. That stopped the remaining list/Overview/Breakdown phase; no retry or second submission occurred. The reusable selector now accepts one visible ancestor/contained-child control and still rejects distinct duplicate controls; 49 control tests pass. This tooling correction is not a fourth native execution. The overall case remains partially blocked, its pending read/PDF phases are not claimed, and a normal-route cold Orders read follows reconciliation.

## Genuine same-origin replacement and authenticated return checkpoint

APK0106 passed genuine same-origin replacement using the independently installed warehouse `7ce7a92f-9abf-476a-bd05-a967fac15124` and its independent core-host certificate. Two cold launches showed login and the replacement identity; old secure credentials, profile and protected caches were absent. Actual completed discovery requests carried neither authorization nor credential query parameters. Both warehouse business/authentication baselines stayed unchanged and no OTP was requested in the replacement stage. Two preparation failures remain preserved: the observer initially expected a flat discovery envelope, then expected a transport event name different from the helper's actual completed-request records. The third permitted cold-replacement attempt passed; no fourth attempt occurred.

The replacement administrator then authenticated normally through one mocked challenge and one new native session. A separate authenticated return stage restored the original independently owned primary warehouse, required login on two cold launches, cleared replacement credentials and observed no forwarded replacement authorization. One subsequent ordinary primary administrator login passed. Business records and unrelated accounts stayed unchanged across both logins. Server sessions were preserved; local identity cleanup does not claim remote logout.

Helper tooling remains separate from application commit `bed4eeee4a008073aa453c32da27cade50a32a2f`. Tooling `a2d4f66a14c1e6ae94876d6113837f806fd698b5` adds fixture-only credential-presence observation and replacement-phone admission only after a real administrator/owner proof. Separate immutable helper source overlays validate the original owning checkout and guard hash before invoking the unchanged ownership guard. All 87 backend source tests passed; native observer/control tooling has 53 control tests. Actual pinned TLS and private IPC readiness were verified, with fresh supervised identities retaining the twelve-hour caps.

The primary helper is now `warehouse-fixture-core-vm2026100102-return05.service`; read-only monitor04 follows this actual identity and preserves earlier monitor logs. Current-state backup checksums and readable catalogs passed before replacement; no restore or transfer occurred. Pending enrollment was absent before replacement, so its cleanup is not established. Unsaved/in-flight switching and other independent native workflows remain pending. Final artifact freeze, the new eight-hour soak and the dedicated natural-expiry appointment remain unstarted.

## Native lifecycle, logout and customer enrollment checkpoint

APK0106 passed three cold launches and three background/foreground recoveries. Each recovery independently observed a fresh successful Orders response; the selected primary warehouse persisted, and business/unrelated authentication snapshots stayed unchanged. Ordinary native logout passed on the third permitted attempt, after two preserved selector preparation failures with no submission. Exactly one confirmation revoked only its matched native session; two cold launches required login and preserved server selection. Six navigation guard tests and three sign-out confirmation/refusal tests passed.

The unused reserved fictional customer enrolled through one ordinary native OTP and reached pending status without a refresh session. A final stage verifier incorrectly required an authenticated session; its failure remains preserved. Read-only verification reconciled the already successful pending flow without another OTP. Three cold pending launches, foreground recovery and one explicit status check passed with no protected tabs, OTP or refresh session; independent snapshots remained identical.

One ordinary administrator API login approved that customer and assigned only Backend Test Customer A. The approval returned success and was independently reconciled exactly once, with unchanged business data and unrelated accounts. The helper's subsequent logout used the wrong endpoint and failed; the overall helper remains **PARTIAL_BLOCKED**. Its temporary administrator session is preserved on the fictional backend because credentials existed only in memory. The source now uses the documented logout RPC; the committed approval was not replayed and no successful logout is claimed for that session. Three approval/refusal tests passed.

Android then displayed actual approved status, explicitly left enrollment through Sign in, removed the one enrollment token, and required login after a cold launch. One further ordinary native OTP authenticated the approved customer; business data and unrelated accounts stayed unchanged. Three authentication-mode admission tests passed. Current private matrix and historical stage ledgers retain every failure and reconciliation. Customer business/isolation workflows, staff workflows, remaining switching/fault cases, final freeze, eight-hour soak and dedicated expiry appointment remain separate work. No application source or APK bytes changed in these tooling stages.

The approved reserved customer's APK0106 assigned-read/visible-role case passed: independently observed fresh Orders200, customer A visible, customer B absent from the visible list, no staff Queue and no create/print controls on the inspected customer screens. Independent business/authentication snapshots stayed identical. This does not claim reciprocal B execution, direct unauthorized operations, documents or Realtime.

Two fresh API-prepared cart stock receipts, FXC701/A and FXC702/B, each have eight units. Ordinary administrator authentication and logout succeeded; independent reconciliation preserved existing business records and unrelated accounts. Preparation plans rejected a missing verifier and an uppercase step identifier before execution; both plans remain preserved. Native catalog preparation then stopped before any item write because the catalog rendered no search input despite its existing search state/API logic. Its independent snapshot is unchanged. The review correction restores an accessible stock search field, with two component regressions proving assigned-customer query context, empty-result recovery and no submission from typing/clearing. Typecheck/lint passed. APK0107 compilation/native acceptance is pending; APK0106 evidence remains scoped to its own bytes.


APK0107 checkpoint: the clean x86_64 release from mobile `b53db175f6c13b39b774a0d8cf1f2a379086f226` and backend application `bed4eeee4a008073aa453c32da27cade50a32a2f` passed compilation, 303 application tests, 98 setup tests, lint/type checks, compiled trust/signature audit and owned API30 installation/read-back. APK SHA-256: `c9184cf60d13482b4f8e52242af3ac08a5bf8e5d21df770ccf88d9e453be871d`. Emulator state was archived locally with verified checksum/catalog; no restoration occurred.

The dependency gate is BLOCKED: seven high transitive npm findings involve node-forge 1.4.0 ([GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)), with no patched release listed. No forced downgrade or unreviewed cryptographic patch was applied. Compiled Expo Updates is disabled; that observation does not clear the dependency gate. Final freeze, readiness and the new eight-hour soak remain unstarted.

The native cart/catalog preparation case exhausted its three actual attempts and is BLOCKED. The first exposed the missing search input, corrected in APK0107. The second stopped before launch on an overly strict foreground prerequisite, corrected in tooling `b039dda`. The third found the search input but observed F02 instead of intended FXC702 during input verification. No item submission occurred. Independent SQL confirms unchanged empty cart, stock, profile, business digest and session presence. The authentication digest changed and remains unresolved; separate session identity/creation/expiry and verified-OTP observations do not establish full reconciliation. Failed screens, ledgers and SQL evidence remain private and preserved. No fourth attempt or alternate alias is permitted. APK0106 customer read/control results remain scoped to those older bytes.


Follow-up read-only reconstruction resolved the cart authentication-digest change: substituting only the bound session's retained consumed refresh-token hash reproduces the entire earlier authentication digest exactly; the current digest matches the observed later snapshot. This proves one ordinary refresh rotation with no new OTP/login or unrelated authentication mutation. No token or individual token-hash value was exported. The input-verification case remains BLOCKED at its three-attempt limit.


APK0107 lifecycle regression recorded an actual native SIGSEGV during the third cold launch, after two cold reads and two background/foreground recoveries. Its logs and tombstone were preserved; native acceptance is stopped, with no log clearing or crash bypass. All 13 release x86_64 picker translation units lacked RN_SERIALIZABLE_STATE. The stack enters RawPropsParser::prepare<RNCAndroidDialogPickerProps>, matching the reported React Native 0.81 ABI mismatch ([upstream report](https://github.com/react-native-picker/picker/issues/663)).

The review candidate pins the published picker patch 2.11.4, whose CMake calls target_compile_reactnative_options for RN >=80. Only this package is explicitly excluded from Expo's recommended-version check, using the [documented version override](https://docs.expo.dev/versions/latest/config/package-json/#installexclude); Expo SDK54 recommends 2.11.1, the version with the observed missing ABI flag. This is a declared compatibility variance, not native verification. A separate compile-command audit refuses missing/disabled flags or absent picker evidence. A clean corrected APK, exact compiler audit and native regression remain required. No build starts below the 25 GiB disk floor. The node-forge dependency blocker is unchanged.


A reusable guarded persistent-cart mutation driver now requires successful, unchanged native preparation before any action. It reconciles add/edit/stock-limit/excess/remove/re-add operations independently and preserves line identity during quantity edits; a failed or uncertain write cannot resume or automatically replay. Four native-control/preparation refusal tests and three SQL transition tests pass. This driver is SOURCE-VALIDATED ONLY: the exhausted preparation case blocks its execution in this campaign, and no cart/order/queue native PASS is claimed. A separate APK0107 customer logout and subsequent ordinary administrator login passed; the administrator lifecycle attempt remains failed on the preserved native crash.


APK0108 checkpoint: a fresh pinned checkout at `893e3e76751e4ad3ec173ebf7bb292963b18a50e` completed plain npm ci, the documented Expo prebuild/release workflow and exact compiled audit. SHA-256: `c7382fb96c0522fbf61e49548cfe66703ca8ca700f2c7dce72ef47ed7213f176`; x86_64 only, fixture package, versionCode 2026100108, unchanged test signer and three fictional trust anchors. All 13 picker translation units now carry RN_SERIALIZABLE_STATE. Application tests 303/303, setup/tooling tests 101/101, lint, typecheck, mobile contract, source scan and Expo Doctor 17/17 passed with the declared picker override. Npm audit still reports seven high node-forge transitive findings; the exact source CI passes its other three jobs and fails dependencies.

The installed APK read-back matches the audited SHA; application storage was preserved. An initial network-preparation input referenced not-yet-created metadata and refused before mutation; an installation precondition then refused because root networking had not yet been restored. Separate corrected inputs restored only owned routing and completed installation. Current device state was archived locally after clean stop, with verified checksum/catalog. Old APKs, failures, logs, compiler evidence and device/warehouse archives remain preserved. Only proven-owned reproducible build intermediates were removed after verifying no frozen plan bound them.

The second lifecycle attempt passed on APK0108: three cold launches plus three background/foreground recoveries, each with actual fresh Orders200, persisted instance selection and unchanged business/unrelated authentication/OTP baseline. The first APK0107 SIGSEGV and tombstone remain a FAIL. This is targeted emulator regression evidence, not an eight-hour soak. Final freeze/readiness/soak and the delayed-expiry appointment remain unstarted.

For reproducible corrected builds, retain the package/lockfile pin and documented single-package Expo override, run plain npm ci and the existing two-worker x86_64 release instructions, then audit the generated x86_64 compile_commands.json with `node scripts/audit-picker-native-compile.mjs <generated-compile-commands.json>` before the compiled APK/signature/trust audit. Missing or disabled ABI flags and absent picker translation units fail this audit; CI now enforces it on generated debug compile commands too. No native build starts below 25 GiB free. The override and passed Doctor checks do not waive the independent dependency gate.


The separate ordinary normal-route receipt/image case FXN801 is BLOCKED after three actual attempts, with no receipt submission. Its first draft reached Review; the synthetic PNG was absent from MediaStore, and actual grid captions include filename/size/date metadata. Exact single-file indexing and caption guards were corrected without changing permissions. Subsequent capture failures came from selecting the DocumentsUI capture class based on background window entries while the app was foregrounded. Source now chooses capture strictly from current focus. Five normal-receipt control/readiness tests and four existing gallery-control tests pass; no fourth native attempt or alternate case alias is permitted. All independent failure snapshots show unchanged backend and stored bytes.

A guarded picker-cleanup check refused because the app was already foregrounded; no gesture was sent. The initial read-only capture failed for the same helper-selection bug and is retained. Corrected read-only capture/reconciliation confirms the owned foreground and unchanged state without submitting or replaying the receipt. This does not establish receipt creation, image upload/render or native business acceptance for FXN801.


APK0108 independent saved-rounding-invoice PDF acceptance passed for invoice 20261010: native details showed total ₹179 and tax ₹9; one new private PDF was generated and downloaded through the actual Android SEND chooser, opened in the original approved Librera reader and automatically copied to Downloads/Librera. Stored, native-download and reader-export bytes match SHA-256 `53a6dfa16e77ab64b61f3ca307155dbaf08f734d7f4393385b99ac028379499d`. Actual one-page viewing and PDF text agree on the total/tax and existing duration/quantity lines. Permissions and remembered reader settings were unchanged. Normal-route cold restoration and independently observed Orders200 passed afterward.

This is an independent PDF group for the existing saved invoice; no second invoice save or fourth exhausted invoice-case attempt occurred. The original rounding-save case remains PARTIAL_BLOCKED at its attempt limit. Unauthorized PDF denial and the remaining invoice cases are separately pending. Tooling `7ca221d` adds exact saved-invoice arithmetic/identity checks and refuses failed, previously selected, changed-config, wrong-artifact or changed-driver preparations; its contract/refusal tests pass. APK application source remains `893e3e7`, with no new build. Final freeze, readiness, the new eight-hour soak and natural-expiry appointment remain unstarted; the dependency gate remains BLOCKED.


APK0108 native administrator inventory reads passed against independent SQL: customer A had 68 units across five GRNs, customer B had eight units across one GRN, and A's item detail showed 68 units. Actual all/customer stock RPCs returned 200; business, unrelated authentication and OTP baselines stayed unchanged. This result is separate from the exhausted cart preparation and receipt/image cases.

Separate normal-route dispatch cases used one fresh ten-unit API-provisioned source receipt FXF900. Ordinary temporary administrator authentication/logout and independent preservation checks passed. FXF901's first native attempt stopped before submission because its base tooling lacked the evidence archive method; valid Review and unchanged SQL were preserved. Corrected attempt two committed exactly one three-unit dispatch, one matching cached result and stock 10→7, preserving unrelated state.

FXF902 then reached actual native success for the remaining seven units: one dispatch, one matching cached result, stock 7→0 and no invoice persistence. Its original plan failed reconciliation because the observer incorrectly treated the existing contract's source out_of_stock=false→true transition as unrelated. Read-only reconstruction replacing only that exact source flag reproduced the entire pre-dispatch digest; independent SQL confirmed out_of_stock=true, original quantity ten and zero stock. The final commit was reconciled without another submission. Original failed ledgers and the initial failed read-only capture helper remain preserved. The narrowly scoped normal observer now checks the expected source depletion flag explicitly; three refusal/reconciliation regressions and actual read-only SQL validation pass. Original fault/offline guards and their blocked results are unchanged.

Normal-route cold restoration and actual Orders200 passed after final dispatch. These results establish ordinary partial/final dispatch and depletion for the audited x86_64 APK; they do not establish native excess/concurrency, lost-response retry, images, staff queue or reciprocal customer isolation. Current review tooling checks passed 110/110 before the final flag regression was added; the next recorded full check covers the final source. Exact completed mobile CI at 75ee785 passed lint/type, source/history scan and Android debug artifact audit, failing the dependency job; backend CI at 6b790e9 passed all seven jobs. Current application source remains 893e3e7; newer commits record tooling/evidence only. Final readiness and the new soak remain blocked/unstarted.


APK0108 switching checkpoint: the third and final confirmed-switch attempt passed, followed by ordinary destination administrator login and the third and final switch-back attempt. Selected genuine warehouse identities persisted through cold launch and each source native session was revoked without changing business, other authentication or OTP baselines. Switch-back attempt two refused before the actor lock, evidence directory or ADB because its manifest omitted two required tooling hashes; its immutable plan/ledger and a static pre-actor diagnosis remain preserved. No fourth switching attempt is permitted.

Expired switching/fault helper identities were retired only after ownership, release, hashes and state-preservation checks. Fresh supervised identities retain the twelve-hour cap. Actual fictional TLS discovery and private IPC readiness passed; the new relay initially reported IDLE with no observations, then one explicit safe initialization disarmed it. That initial readiness refusal and all old relay observations remain preserved. Monitor07 uses the new immutable identities; no terminal-dependent listener or warehouse restoration was introduced.

The reserved approved customer was temporarily assigned literal staff through the normal administrator API, authenticated normally in Android, logged out through the UI and restored to customer. Source review found queue access uses admin/supervisor, while the distinct literal staff role is excluded. A corrected explicit supervisor preparation, ordinary native login and read-only Orders/Queue case followed. Actual cold Orders200, visible Queue and refreshed Queue200 succeeded; the case then failed waiting for a Create GRN label absent from the populated toolbar. Separate read-only reconciliation proves the complete business/authentication/OTP snapshot unchanged. The original native case remains PARTIAL_BLOCKED; queue processing, cart/order creation and create-control acceptance are not claimed. Its ordinary supervisor logout passed two cold login requirements, and normal API restoration returned the reserved account to approved active customer with no session, preserving assignments and all unrelated fields/data. Neither temporary role remains installed.

Reviewed application correction 696165f4a4494c8b5652e4e98965ad05d600d10e labels the existing GRN and invoice create buttons. It also removes three unused normal-dispatch observer imports exposed by exact mobile CI at e74a328: lint failed, later test/type steps skipped, dependency job failed, and source/history plus Android debug artifact audit passed. Backend CI at 395aa4d passed all seven jobs. Local corrected lint and typecheck passed; the current frozen tooling source f40754a passed 118/118 setup tests and source/history scan. These are source checks, not acceptance of a newly compiled APK. The installed APK remains application source 893e3e7 and its exact build0108 bytes; the accessibility correction still needs a fresh audited build and the under-cap native regression.

Administrator OTP usage reached eighteen of twenty daily requests after reversible fixture preparation/restoration. Remaining authentication must respect the existing limit and its natural reset; no counter or timestamp is changed. Current disk is below the twenty-five-GiB native-build floor, so a new build must wait for independently verified retirement of owned reproducible intermediates after preservation, without deleting unrelated state/caches. Final freeze, readiness, new eight-hour soak and delayed-expiry appointment remain unstarted; the independent dependency gate remains BLOCKED.


APK0109 checkpoint (2026-10-02): a clean pinned checkout at mobile application commit `696165f4a4494c8b5652e4e98965ad05d600d10e`, paired with backend application `bed4eeee4a008073aa453c32da27cade50a32a2f`, completed plain npm ci and the documented two-worker Expo/Gradle release workflow. The x86_64 fixture APK has versionCode `2026100109` and SHA-256 `08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7`. Exact compiled signature, package, permissions, three fictional trust anchors and all thirteen picker ABI compilation units passed audit; installed APK read-back matches. Application tests 303/303, build-source setup tests 118/118, lint, typecheck, SDK/mobile contract, source/history scan and Expo Doctor 17/17 passed with the previously declared picker variance.

Before this build, the owned AVD was stopped cleanly and archived privately with verified checksum and readable catalog. Only independently verified owned reproducible intermediates were retired after preserving their inputs and checking ninety-four immutable plans for bindings. Build admission verified more than 25 GiB free. The initial monitor-integrity preflight refusal occurred before Gradle execution and remains preserved; the corrected guard required a recent complete integrity sample. No warehouse/device restoration or unrelated cache deletion occurred.

On these exact APK0109 bytes, ordinary reserved-customer authentication, assigned-customer Orders reads and visible role controls passed, followed by UI logout and two cold login requirements. The reserved account was then temporarily changed to supervisor through the normal administrator API and authenticated ordinarily. Corrected supervisor read attempt two passed actual cold Orders200, visible Queue, fresh Queue200 and accessible Create GRN/Dispatch/Invoice controls. No business submission occurred; independent SQL proved unchanged business, unrelated authentication and OTP baselines. The original APK0108 accessibility failure remains preserved. Supervisor logout passed, and normal API restoration returned the account to its original approved active customer state with no active session and unchanged assignments. These read/control results do not establish queue processing, receipt/image submission or reciprocal customer execution.

Subsequent tooling commit `91a713503f0bf608259ca36e017efd4e8858d042` passed 119/119 setup tests and source/history scan. Authentication observers now include additional dispatch/invoice lines, images, order items and idempotency state; actual populated-fixture native observations passed. Monitor09 is supervised and bounded to 256 stage plans and 4096 bound files, refuses overflow and checks every plan rather than silently truncating after one hundred. Its three Python regressions passed. These tooling changes do not alter the installed application bytes.

Read-only server evidence records the administrator at its existing twenty-request daily limit, naturally resetting on 2026-10-02 at 16:39:22.426095 UTC (22:09:22 IST). Dependent administrator authentication is paused until that reset; no quota or timestamp was modified. The fresh APK0109 dependency audit still reports seven high node-forge findings. Final artifact freeze, thirty-minute readiness, the new eight-hour soak and the dedicated natural-expiry appointment remain unstarted. Historical APK0106/0108 PDF, inventory, switching and lifecycle results retain their original artifact scope; the completed older-APK soak is not transferred to APK0109.


APK0109 disabled-account native acceptance passed on corrected attempt two. The exact independently identified fictional Customer B remained disabled/inactive. One ordinary fresh mock OTP was consumed, Android displayed Verification Failed, and cold launch required login. Independent SQL proved no refresh session was issued, the one pre-existing enrollment token was preserved, and profile/business/unrelated authentication remained unchanged. Attempt one stopped during pre-auth observation before ADB or OTP because tooling incorrectly required zero retained enrollment tokens; its failure is preserved. The correction binds the observed existing count and requires it unchanged rather than deleting state. Five authentication admission/refusal regressions passed; the complete corrected tooling suite passed 120/120. The installed application remains the same audited APK0109 bytes; this result does not establish native revocation or rejected-account acceptance.


APK0109 synthetic-camera QR acceptance passed on the third and final native attempt. The SDK imagefile camera fed a deterministic QR containing only the exact fictional core HTTPS origin into Android CameraView. Android displayed the genuine Fictional Core Warehouse discovery preview; leaving with Back never activated Use this server. Two public-selection storage checks and cold login restoration passed, with zero OTP requests and independent unchanged digests for all 97 owned public/authentication/security/storage tables. The explicitly temporary fixture-app camera grant was restored to its original denied state; reader permissions were unchanged. This establishes emulator synthetic-camera evidence only, not physical camera/QR acceptance.

The first native attempt timed out; the second retained a frame proving the large QR was clipped at the right edge. Both failures were independently reconciled unchanged before another attempt. The final correction uses a smaller QR positioned inside the observed visible frame, with a new immutable image, private manifest and owned camera supervisor. A separate initial manifest-mode refusal occurred before any native actor or permission change and is preserved. Clean stops preceded private checksummed/readable AVD archives; the same owned storage booted without restoration, cloning or APK reinstall. Monitor11 follows the new supervisor. No fourth QR attempt is permitted.

QR source/refusal/privacy checks and the complete tooling suite passed 124/124, with lint and source/history scan passing. Source 64438dd records the guarded driver and diagnostic correction; installed application source and APK0109 SHA remain unchanged. Exact published predecessor mobile CI fe59c4447f0f115ef700cd7eaeaffbcec93f864e passed lint/type/tests, source/history scan and Android artifact/ABI audit, failing dependencies only. Backend CI a16bdc96ef59fef9eb74a47b27678712837b06a1 passed all seven jobs. The dependency gate, final freeze/readiness, new soak and delayed-expiry appointment remain open.


APK0109 lifecycle acceptance passed on the third bounded lifecycle attempt: three cold launches and three background/foreground recoveries, each independently observed as fresh Orders200. The exact genuine primary selection persisted, and no ANR/crash, new OTP or business mutation occurred during the lifecycle run. The earlier APK0107 SIGSEGV and APK0108 targeted recovery retain their original evidence/artifact scopes; no fourth lifecycle attempt is permitted.

One ordinary reserved-customer OTP login preceded this run, respecting its existing quota and leaving administrator counters unchanged. The fixture-only lifecycle admission now explicitly binds the original reserved customer UUID/name/role; it refuses switching/logout modes, another profile or administrator role. Independent SQL additionally preserves OTP records, quotas, enrollment tokens, dispatch images and idempotency state while allowing normal refresh of only the bound native session. All 125 tooling checks, targeted guard refusals, source/history scan and actual populated-fixture SQL validation passed. Frozen tooling source 574f531 executed the native case; application commit and exact audited APK0109 bytes are unchanged. The reserved account remains normally authenticated as its original customer role for dependent customer workflows; no token or plaintext OTP was published. This is bounded native regression evidence, not the required final eight-hour soak.


APK0109 native Realtime foreground delivery and reconnect passed on corrected attempt two. The original approved reserved customer remained authenticated on the genuine primary instance. A separate fictional Customer A caller authenticated through one ordinary mock OTP request/verification; credentials stayed in process memory. Supported cart RPCs added one fresh line at quantity one, then changed that same line to two only after the first SQL reconciliation and native delivery passed. Android displayed the exact assigned-customer card and independent fresh Orders200 in both delivery windows, without manual refresh or navigation. Between them, two stable Android observations established no default network, with an exact fixture-UID loopback rejection; owned airplane/radio/reverse settings and rule were restored before the second trigger.

Independent SQL preserved stock at eight, every earlier cart revision, unrelated business and authentication state, and the original native session. Exactly two revisions and one item line remain intentionally preserved; normal logout deleted only the newly issued API-caller session. The first attempt failed before OTP or writes because the observer incorrectly expected an empty cart to have no visible card. Its ledger and read-only native diagnosis are preserved; the correction binds the application's actual Empty/No items yet card and adds an exact regression test. Frozen tooling b766918 executed attempt two; application source and audited APK0109 bytes remain unchanged. This proves customer Orders delivery/reconnect on the emulator, not native cart editing, staff topic delivery, reciprocal Realtime isolation or missed-write replay.

The complete orchestration tooling suite passed 139/139; source/history scans passed before the final observer correction, with final publication checks tracked separately. Required dependency, final freeze/readiness, new eight-hour soak and delayed natural-expiry appointment remain open.


APK0109 authorized rounding-PDF acceptance passed using the original approved reserved customer's existing session, without another login or role change. The second independently scoped PDF attempt generated exactly one new private document for saved invoice 20261010; native download, Android SEND, original approved Librera scroll-mode viewing and automatic Downloads copy all passed. The actual one-page reader image displays tax 9, total 179 and the expected quantity/duration/day lines. Stored, native-downloaded and reader-export bytes share SHA256 b05cff567f130bdfb1090da70cc2a9d5f0187599db597db4dab464d787368786. Existing reader permissions and remembered selection were not changed.

Before native regeneration, the recognized earlier cache/export files were copied into the private attempt evidence, independently checksum-verified and parsed as readable PDFs. All older warehouse documents and bytes were preserved; the new reader copy was created after this native share. Independent post-reader/cold-read SQL confirmed preserved native session, OTP baseline, unrelated authentication and business state. Normal-route cold Orders200 passed after restoring the fixture foreground. Frozen tooling cc22916 executed this case; the exact APK0109 application bytes are unchanged. All 141 tooling checks and pinned source/history scans passed. APK0108's earlier PDF result remains separate; the exhausted invoice-save/read group was not rerun or given another acceptance attempt. Unauthorized/reciprocal PDF denial and broader arithmetic/workflow cases remain independent.

Exact Realtime checkpoint CI 36981302309 identified thirteen lint errors in fixture tooling declarations: six missing explicit Node timer bindings and seven unrecognized structuredClone globals in tests. The failed CI job/log is preserved. The correction imports timers from node:timers and uses globalThis.structuredClone in tests without changing application or frozen runtime inputs. Local lint passed with zero errors and its existing 1463 warnings; all 141 tooling tests passed. Dependency findings remain an independent blocker; fresh exact-head CI is required after publication.


APK0109 sustained Orders-offline and rapid-connectivity acceptance passed on the third and final permitted Orders-offline attempt. The current original approved customer session loaded assigned Orders, then actual Android device disconnection was established by two stable no-default-network readings, owned radio/airplane changes and an exact fixture-UID loopback rejection. Native offline/stale-cache warnings appeared; an explicit refresh made no successful current Orders RPC during the sustained observation. Reconnection restored current Orders200. Three additional bounded connectivity cycles each independently established disconnection and restored a fresh Orders200; observed cycle durations were approximately 4.4 seconds each. No business submission or new OTP occurred.

Independent checks verified original airplane/radio settings, normal reverse route, absent owned rejection rule, normal-route cold Orders200, and identical before/after plus post-cleanup SQL preservation. Frozen tooling 256f7b5 executed the case, with exact APK0109 bytes unchanged. All 142 tooling tests, lint and pinned source/history scans passed. Earlier offline attempts and their artifact scopes remain preserved; no fourth attempt or alias is permitted. This is emulator connectivity evidence, not physical Wi-Fi/cellular acceptance or offline receipt/dispatch acceptance. The private acceptance matrix now reconciles previously stale pending rows against exact scoped QR, lifecycle, Realtime, PDF, replacement and capped-case checkpoints rather than treating historical fields as current results.

Exact corrected predecessor mobile CI c52af8a passed Lint & Type Check and source/history scan; dependencies still failed and the Android job was pending at observation. Backend predecessor c91b707 passed six jobs with isolated installation still pending. Fresh exact-head CI remains required after this publication; final freeze, readiness, eight-hour soak and delayed expiry remain unstarted.


APK0109 native Customer A-to-B receipt denial passed on the first bounded attempt. The existing approved reserved customer remained assigned only to A. A direct native link requested the real independently provisioned B receipt FXC702; a fresh get_grn_details RPC200 was observed, Android displayed Failed to Load / GRN not found or access denied, and two native observations contained no B receipt/customer content. Read-only SQL before and after proved that the target existed, belonged to B, remained unassigned to this customer, and all business/authentication/OTP state was unchanged. Normal-route cold Orders200 passed without a new login or business write. Frozen tooling 1e0d55e executed the case; application and exact APK0109 bytes are unchanged. All 144 tooling tests, lint and source/history scans passed.

The prerequisite inventory found no B invoice or B image. Native PDF/image denial therefore remains pending genuine fixtures; absent/fabricated IDs cannot establish isolation. Reciprocal B-to-A and staff boundaries remain separate, with ordinary administrator preparation respecting its natural quota reset. This independent denied-receipt case does not rerun the exhausted saved-invoice/GRN navigation group or establish successful native image upload.
# Late-discovery driver preparation (2026-10-02)

The independent unsaved customer-master draft cancellation driver is source-prepared with a ten-minute deadline, exact APK0109/primary/switching identities and an ordinary supervisor session. A genuinely empty unique visible name field must receive the owned fictional marker before any discovery; existing, duplicate, disabled or offscreen fields are refused. Supported operator-server navigation, genuine different-instance discovery and cancellation must retain the exact editable draft, selected primary and all SQL session/OTP/authentication/business state. Normal-route cold Orders completes cleanup of only the owned in-memory draft; no Save, OTP or business submission exists in the driver. All 174 setup checks, changed-source lint and Python syntax passed. It refuses the current customer role and remains unexecuted until normal supervisor preparation. This required draft-specific case is distinct from the completed baseline cancellation case and cannot run without a real draft. Other GRN/dispatch/invoice drafts and in-flight operations remain pending.

The fault helper was renewed independently under a fresh identity after exclusive actor/release/ownership checks. Its prior disarmed state, empty observations, unit configuration and final log hash are preserved. Actual TLS identity and IPC status passed for the new disarmed helper, with no warehouse mutation and the existing twelve-hour cap. Read-only monitor14 follows the new helper; its first full sample verified 1595 current/preserved bindings unchanged, retaining 17 warnings for terminal historical plans. These warnings never authorize resuming historical plans.

B-to-A invoice denial is source-prepared for exact APK0109, the genuine Customer B profile and saved A invoice 20261010/179. SQL must establish that this real invoice/customer exists and is not assigned to the native B profile. Android must show the existing denial alert followed by Invoice Not Found, with no A content, totals, Breakdown or PDF controls; an actual fresh get_invoice_data RPC, normal-route cold assigned B Orders and unchanged authentication/business snapshots are required. Wrong targets/identities/artifacts, mixed modes, assigned invoices and inactive/unmatched sessions are refused. All 172 orchestration tests, changed-source lint and Python syntax passed. No native attempt or authentication occurred. This is invoice/UI document-access preparation only; unauthorized PDF transport and image denial remain independent unproved cases. It does not rerun the capped saved-invoice navigation group.

B approval transport/actor integration is now prepared and its actual pre-OTP quota refusal was verified using frozen tooling f20e8f5. The corrected bounded run reached the exclusive native actor lock, genuine TLS discovery, owned IPC socket permission checks and real read-only SQL, then refused the actual 20/20 administrator quota before creating an approval attempt directory or OTP request. Independent post-run SQL matched the earlier snapshot exactly. The initial generic refusal is preserved; a source-only diagnostic correction identified the refusing phase. No IPC challenge exchange, authentication, approval or cleanup mutation occurred. Full 170 setup tests, wrapper lint and Python syntax passed before execution. Actual approval remains pending a fresh immutable stage after natural quota reset.

The B approval read-only SQL observer passed two identical populated-fixture snapshots. The real B profile is disabled/logged out with one retained inactive B assignment; the controls refused the actual 20/20 administrator daily quota before OTP. Observations include static profile, old administrator sessions, target assignments/OTP and complete other-authentication/business/storage metadata hashes, without exporting credentials. No approval or authentication occurred. Owned transport/actor-lock integration remains outstanding.

Ordinary B approval controls/orchestration are source-prepared. They bind the genuine disabled, logged-out Customer B and its existing inactive B assignment, require normal administrator quota before OTP, hold access/refresh/OTP only in memory, reconcile one new administrator session before approval, and allow exactly one supported approval. Existing assignment identity and metadata are retained except the RPC-authorized active/assigner/time fields. Business, other authentication including the original native customer, old administrator sessions and target OTP state must remain unchanged. Only the new administrator session is normally logged out after independently reconciled approval. An uncertain OTP or approval response stops without automatic retry or cleanup. All 170 setup tests and lint passed, including lost-approval-response and secret-free record checks. Owned transport/SQL wrapper integration and real execution remain pending; no OTP, approval or account change occurred.

Reciprocal B-to-A receipt-denial support is source-prepared for exact APK0109, the genuine Customer B profile and existing A receipt FXC701. Independent SQL must verify the real receipt/customer and absence of assignment, plus an active customer and its matched native session. Android must display the existing access-denial message without target content; a fresh receipt RPC and normal-route assigned B Orders read, with identical session/OTP/authentication/business snapshots, are required. Mixed customer modes, wrong identities/target/artifact and assigned targets are refused. All 167 setup tests, changed-source lint and Python syntax passed. No native case, authentication or approval was executed; ordinary supported B approval and login remain prerequisites. This is independent reciprocal coverage, not an alias for a capped case.

Rejected-account native authentication is now source-prepared using the existing ordinary OTP driver, restricted to the genuine fictional Customer B profile. The SQL observer requires an actual inactive rejected profile, no sessions and the preserved existing enrollment-token count before authentication; afterward it requires one ordinary verified challenge, no issued session, unchanged target profile/tokens and unchanged business/unrelated authentication. Android must show Verification Failed and require login after cold launch. Disabled and rejected modes are mutually exclusive. All 165 orchestration tests, changed-source lint and Python syntax passed. No administrator decision, OTP, native attempt or account mutation was executed; real supported rejection and authentication-budget prerequisites remain outstanding.

A bounded read-only natural-expiry SQL observer now reports the exact owned session ID, issue/expiry timestamps and actual server time, plus hashes covering other sessions, authentication, assignments, OTP/quota/enrollment state, business rows and storage metadata. Two matching populated-fixture snapshots passed without token export or mutation. This development check used the original emulator session and does not supply dedicated-device evidence or authorize an appointment. The observer rejects other accounts and malformed session identifiers before SQL; source checks and lint passed.

Dedicated natural-expiry execution now also binds the exact preserved server expiry and validates both derived appointment boundaries. Earlier altered expiries, shortened waiting windows and extended execution deadlines are refused. All 164 setup tests and changed-source lint passed; this remains source-only preparation.

Dedicated natural-expiry scheduling controls are source-tested only. They derive the appointment from recorded actual server expiry plus ten minutes, impose a one-hour execution deadline, and refuse missing final-freeze/artifact proof, cloned authenticated state, use of the original disposable AVD, PDF-reader installation, timestamp manipulation, refresh/logout after clean stop, insufficient certificate lifetime, early/late checks, changed bindings or competing execution. No dedicated AVD, new authentication or expiry appointment has been created. Actual scheduling remains dependent on final artifact freeze and normally authenticated dedicated-device evidence; these controls do not establish expiry acceptance.

Future selected-server persistence observations now query only `operator_server_v1` through the owned emulator's existing `/system/bin/sqlite3 -readonly`, recording only origin and instance ID. They no longer copy the application database/WAL, which can contain authentication material. The actual on-device read-only query passed for the saved primary origin and instance ID; no token/app-database copy or storage change occurred. Historical evidence remains preserved. This tooling/privacy correction does not rerun an exhausted native case or transfer its result to a new artifact.

Current reserved-customer revocation tooling is prepared but unexecuted. It uses ordinary administrator OTP verification with credentials held only in API-process memory, a one-hour stage bound, exact APK/native actor ownership, genuine TLS identity, private IPC and a single supported disable attempt. Dependency closure is checked before authentication and again before disable; pending workflows or unreconciled capped failures prohibit execution. The supported RPC retains assignment rows while deactivating them and deletes only the reserved customer's sessions. Preservation controls require unchanged business/unrelated authentication state, preserved old administrator sessions, cleanup of only the newly issued administrator session, and native cold/foreground login requirements. A lost committed response stops without replay. Actual populated-fixture SQL passed two matching read-only snapshots and exhausted-quota refusal; no OTP or account mutation occurred. The administrator's effective daily quota remained 20/20 until its natural reset at 16:39:22.426095 UTC. Full setup checks passed 161/161 before final wrapper integration; final wrapper lint/full checks are recorded separately. This source preparation does not establish native revocation or delayed-expiry acceptance.

APK0109 native discovery transport failure/recovery passed on its first attempt with tooling `05252fa`. A temporary rule matched only this fixture application's UID, switching-host address `10.0.2.2` and TCP443. Android displayed `Network request failed`; the exact rule recorded two rejected packets (120 bytes). The rule was removed, genuine independent switching discovery recovered with its actual identity, and a normal-route cold Orders200 passed without selecting the destination. Session, OTP, other authentication and business snapshots matched. An independent post-actor check confirmed the owned rule absent and primary reverse route intact. All 152 setup tests, lint, syntax and source/history scans passed. This establishes a switching-host transport failure preserving the current warehouse/session; HTTP status errors and compatibility rejection remain separate unproved cases. No radio changes, authentication, business writes or token-bearing app database copies were required.

APK0109 different-instance cancellation passed with tooling `d73099e` on the existing customer session. Genuine independent switching discovery and its displayed identity were followed by the exact sign-out/discard warning and cancellation. A normal-route cold Orders200 passed, and session, OTP, other authentication and business snapshots matched. This was the third/final permitted campaign cancellation attempt; the original failure and older APK PASS remain preserved separately. No further cancellation alias is permitted. No token-bearing app database was copied. This result does not establish unsaved-draft retention, in-flight switching or confirmed switching on APK0109. All 150 setup tests, lint, syntax and source/history scans passed before execution.

APK0109 malformed-origin regression passed with tooling `53a4cac` on the existing reserved customer session. Native HTTP, path-bearing and query-bearing origins each displayed the exact expected validation error without a candidate. A normal-route cold Orders200 and unchanged session, OTP, other authentication and business snapshots passed. This is the second campaign attempt for this case; the older APK0105 result is preserved separately. No token-bearing app database was copied. It establishes native malformed-origin validation, not failed HTTP discovery or compatibility rejection.

The primary helper was renewed under a fresh identity with the original hash-bound owning checkout and unchanged warehouse identity/state. Actual TLS/IPC readiness and the existing 12-hour cap passed; prior unit and log evidence remain preserved. The read-only monitor follows the new primary and switching helpers. Final readiness and the new soak remain unstarted.

Native acceptance subsequently passed on APK0109 with corrected tooling `f8a88fb`. The initial attempt failed before discovery because customer Settings does not expose the expected profile label; its independent SQL reconciliation passed and all evidence remains preserved. The corrected attempt used the observed Settings controls. Actual switching-helper delay began at 09:36:53.347 UTC, departure from selection was observed at 09:36:54.703512, and genuine HTTP 200 completed at 09:36:56.350. Two subsequent Settings observations showed no stale discovery preview or alert. A normal-route cold Orders read passed, and before/after session, OTP, other authentication and business snapshots matched. This establishes late discovery after leaving only; switching during business saves/uploads remains untested. The fresh helper preserves the original switching warehouse identity/state and hash-bound ownership guard, with actual TLS/IPC readiness and the existing 12-hour cap. Historical helper/monitor evidence remains preserved.

The fixture-only native late-discovery driver is implemented but has not yet executed. It binds APK0109, the existing reserved customer, the genuine primary and independent switching identities, and a three-second switching discovery delay. It requires an actual delay-start event, departure from selection before the genuine HTTP 200 completion, absence of a stale preview/alert after departure, a normal-route cold Orders read, and unchanged session, OTP, other authentication and business snapshots. It does not select a server, request authentication or submit business writes. The log observer reads only a bounded new slice and exports transport metadata.

All 148 setup tests, changed-source lint and Python syntax verification passed. Helper replacement, immutable native stage preparation and emulator acceptance remain pending; these source checks do not establish native race acceptance. The separate backend ownership correction retains the original hash-bound switching container guard. A consistent local switching-state backup and readable database/storage catalogs were preserved before helper preparation; no restoration was performed.

## Genuine compatibility rejection on APK 0109

A separately installed fictional warehouse from backend source `e449340acd1ceb17a36d85dc7b6c6a98263be27a` declared minimum client version `0.2.0` before its first startup. Its installation, repeat setup, migrations, administrator bootstrap, doctor and identity/data preservation passed. The existing fictional switching TLS route was attached sequentially after a verified consistent private backup of the old warehouse; neither warehouse state was replaced or restored.

The bounded native stage on APK 0109 passed on 2 October 2026: genuine discovery returned HTTP 200, the app displayed `This server requires app version 0.2.0 or newer.`, and offered no server-selection action. Cold restoration retained the primary instance, a fresh Orders request returned HTTP 200, and independent SQL snapshots preserved the current session, authentication and business state. No OTP or business write was issued. Tooling source `1493740` passed all 176 setup checks, lint, Python syntax and secret scan. Private proof: `native-compatibility0109-01-proof.json`; immutable stage: `stage-compatibility-0109-v1.json`. This is compatibility-rejection evidence, with no claim of confirmed switching or final artifact readiness.

## Dedicated natural-expiry scheduler preparation

Fixture-only tooling now derives a one-shot systemd appointment from the preserved session's actual expiry plus ten minutes, retaining fractional timestamps. Generated service settings enforce `Restart=no`, a one-hour runtime cap, private permissions and whole-process-group termination. The timer disables persistent catch-up and randomized delay. Exclusive unit/log creation and unit validation precede timer startup; occupied evidence, changed bindings, competing actors, late scheduling or an unfrozen artifact are refused. Timer read-back must match the derived appointment.

All 180 tooling tests and lint passed; systemd independently parsed a fractional UTC calendar timestamp. One test-pattern escaping failure was corrected and remains preserved privately. This is source/scheduler preparation only: no actual expiry timer, dedicated AVD or native expiry result exists yet. The real appointment requires final artifact freeze, a newly created dedicated API30 x86_64 AVD with its own ordinary authenticated session, clean stop and verified storage preservation. The native executor and local scheduler integration remain to be completed and exercised.

## Dedicated expiry executor source preparation

The dedicated native executor and real-SQL observer are implemented in review source. Before boot, they require released-run guards, the actual expired session, valid fictional certificate, matching frozen APK/bindings, the shared actor lock, unchanged preserved AVD files, an unused emulator serial, and an inactive hash-bound dedicated supervisor with no restart and a one-hour cap. The original disposable emulator, malformed device/unit identities and sensitive error output are refused.

The executor checks API30/x86_64 identity, exact installed APK, prepared hosts/capture tooling and absence of the PDF reader, establishes only the dedicated device's owned reverse route, and requires the login screen without sending OTP or entering credentials. SQL reconciliation detects target-session mutation, new sessions/OTP activity and unrelated business changes. Success requires verified clean device stop; failure preserves the attempt and never retries automatically. All 183 tooling tests, Python syntax and lint passed. These checks remain source/refusal evidence: no dedicated AVD boot, expiry appointment, actual expired-session native run or final artifact freeze is claimed. The real scheduler adapter and populated dedicated-device integration remain pending.

## Real expiry scheduling adapter source preparation

The actual scheduling adapter and actor-lock launcher now implement the previously pending systemd integration. They check exact executor/configuration/source bindings, actual unexpired SQL session expiry, fictional certificate and frozen artifact hashes, and the dedicated supervisor's stopped ownership state before exclusive unit/log creation. The shared actor lock spans the scheduling mutation. Unit validation precedes timer start; the active waiting timer must read back the derived expiry-plus-ten-minutes appointment. No recovery or retry path is installed.

All 184 tooling tests, Python/JavaScript syntax and lint passed, including sanitized refusal of malformed scheduling inputs. The happy-path unit installer remains tested through a bounded injected adapter; no real expiry timer was created, no dedicated AVD boot occurred, and no natural-expiry result is claimed. Populated dedicated-device integration, final freeze and the real appointment remain pending. Earlier statements that the adapter/native executor were unimplemented are historical preparation checkpoints, superseded by these source changes.

## Unsaved invoice cancellation driver preparation

A separate supervisor-only driver now prepares a genuine unsaved invoice-header number, discovers the independently provisioned switching warehouse, cancels selection, and requires the exact editable draft marker to remain. It refuses a preselected GRN, duplicate/disabled/offscreen fields, existing case marker, wrong role/identity/artifact and mixed customer-read modes. It never selects a destination, requests OTP, advances to invoice review or saves an invoice. Independent SQL preservation and normal-route cold Orders checks follow abandonment of only the case's in-memory draft.

All 186 tooling tests, Python syntax and lint passed. This is source preparation only; the current customer session is deliberately refused and ordinary supervisor preparation remains required. No native result or invoice-save acceptance is claimed, and the exhausted rounding-invoice save group is unchanged.

## Unsaved GRN cancellation source preparation

A distinct supervisor-only GRN header driver now requires the bound generated default `A0001`, edits it locally to marker `FXS991`, cancels genuine different-warehouse discovery/selection, and checks that the editable marker remains. The exact receipt input, initial default, role, identity and APK are guarded. It does not select sender/items, open the image picker, advance to review, submit a receipt or replay any exhausted receipt/fault case. Native and SQL preservation checks are followed by abandoning only the owned in-memory marker through cold restart.

All 188 tooling tests, Python syntax and lint passed. The generated-number implementation is read-only; its expected default must still be reconciled against current populated state before preparing a native attempt. This remains source preparation only, with ordinary supervisor preparation and native execution pending. Receipt creation/image acceptance and capped earlier attempts remain unchanged.

The subsequent actual read-only generated-number checkpoint found zero eligible single-letter numeric GRNs and unchanged results across two snapshots. Under the reviewed number-generation contract this establishes the current `A0001` default without invoking a write or reserving a document number. Private evidence: `grn-generated-default-readonly01.json`. The native driver still requires an exact visible match before editing; future fixture changes require a fresh check. Supervisor preparation and native cancellation remain pending.

## Unsaved dispatch cancellation source preparation

A distinct supervisor-only dispatch-header driver edits only initially empty optional notes to `Fixture VM0109 unsaved dispatch`, cancels genuine different-warehouse selection, and requires the exact enabled visible marker to remain. The optional-fields toggle is uniquely matched to its nearest bounded clickable ancestor; occupied, duplicated, disabled and offscreen fields/controls are refused. It does not edit the dispatch number, select customer/stock, advance to review, save or submit. SQL preservation and normal-route cold Orders checks follow abandoning only the owned in-memory marker.

All 190 tooling tests, Python syntax and lint passed. Native execution remains pending ordinary supervisor preparation. The driver does not rerun or clear capped before-upstream, after-commit or offline dispatch cases, and no dispatch commit is claimed.

## Late Orders response on server selection preparation

A separate current-customer driver now refreshes Orders through the optional five-second fictional read delay, requires the actual delay-start event, opens server selection while that read remains pending, and checks that the genuine late response leaves selection/session unchanged. Its independent verifier requires exactly one successful matching read, native selection entry strictly between delay start and helper response completion, and bounded timing. The source drains initial reads and requires both Kong read evidence and actual helper response completion; upstream completion alone is insufficient.

The driver does not select a different instance, request OTP or write business data. Normal-route cold Orders and SQL preservation are required afterward. All 192 tooling tests, Python syntax and lint passed. This is source preparation only; the delay helper remains unstarted and native execution is pending. It does not repeat the capped baseline cancel-switch case or claim confirmed switching during requests, uploads or saves.

## Late Orders selection race native result

The five-second fixture-only Orders helper was started under a new supervised identity with the existing twelve-hour cap. Native attempt 1 failed because a second startup read was pending when refresh was tapped. Attempt 2 proved the intended pending-response ordering but failed the verifier because a serial post-completion refetch was counted with the measured read. Both failures and independent unchanged-SQL reconciliation remain preserved. The driver now requires settled startup reads; the verifier requires one pre-selection read and its unique successful completion before any subsequent read starts, refusing overlapping ambiguous reads. All 194 tooling tests and the committed-source secret scan passed.

Attempt 3, the final permitted corrected rerun, passed on APK 0109 with tooling `35ab85a`: read start `2026-10-02T13:44:10.308Z`, visible selection `2026-10-02T13:44:11.591130Z`, and genuine response completion `2026-10-02T13:44:15.308Z`. Selection stayed visible, cold Orders returned HTTP 200, and independent SQL snapshots remained identical. No OTP, selection activation or business write occurred. Private proof: `orders-selection-race0109-final-proof.json`; immutable stage: `stage-orders-selection-race-0109-v3.json`. This supersedes the preceding unstarted preparation checkpoint. Confirmed switching during requests/uploads/saves remains unproven; no final artifact freeze or new soak is claimed. Returning the primary helper to an independently supervised normal-delay-free identity remains the next cleanup step.

## Normal-route cleanup and role-preparation reconciliation

After the late Orders race, the old delay helper was stopped and its final log hash preserved. The first normal-helper setup was refused before unit creation because its required private log directory was missing; that configuration, stop evidence and failure remain preserved. A fresh `normal09` identity with a prepared private directory passed genuine TLS discovery, IPC readiness and twelve-hour supervision checks. Native installed-APK read-back, persisted primary identity and a cold Orders HTTP 200 passed without any injected delay or OTP. Monitor 18 follows the new helper. Warehouse services and stored state were unchanged. Private evidence: `primary-normal-readiness09.json` and `primary-normal09-cold-read/result.json`.

The existing ordinary role-preparation helper now reconciles exactly one newly issued administrator session before attempting a role change, then reconciles the role commit and preserved business/unrelated authentication state before logging out only that new session. Missing/extra sessions, unchanged role, assignment changes or other state differences stop cleanup; uncertain responses remain preserved without replay. All 195 tooling tests and changed-source lint passed. Actual role preparation remains pending target logout and the natural administrator quota window; no authentication or role mutation was performed by this preparation.

## Owned ordinary role-stage integration

Role preparation now requires exact tooling/configuration hashes, the current delay-free core helper, unchanged original fixture guard, a deadline within both one hour and the campaign, and the inherited exclusive native-actor lock. Actual helper ownership includes its source path, running/no-restart state and twelve-hour cap. The endpoint allowlist and source/release/deadline guards are rechecked before API calls and SQL snapshots. A logged-in reserved target or exhausted quota is refused before creating an attempt directory or requesting OTP. Old unbound role-preparation invocations are intentionally refused. Use `scripts/fixture-ui/role-prepare-api30.py` under the owned Docker group for a freshly bound private stage; do not reuse historical or expired configurations.

All 196 tooling tests, changed-source lint and committed-source secret scans passed. Frozen tooling `04dc0f5` was exercised against the populated primary using normal helper 09: it refused at `PRE_OTP_LOGGEDOUT_STATE_AND_QUOTA`, with no attempt directory, OTP, role change or ADB action. Independent token-redacted SQL before/after snapshots matched. Private proof: `role-prerequisite-refusal03-proof.json`. This proves guarded integration/refusal, with ordinary role change and supervisor draft acceptance still pending.

## Ordinary Customer B rejection driver preparation

The guarded ordinary administrator rejection driver is now implemented: [owned launcher](../scripts/fixture-ui/b-rejection-api30.py), [transport adapter](../scripts/fixture-b-rejection-api.mjs) and [preservation controls](../scripts/fixture-b-rejection-controls.mjs). It only targets the reserved fictional Customer B after that account is approved and normally logged out. It requires hash-bound closure of reciprocal receipt, reciprocal invoice, private-document and Realtime-isolation work on APK 0109 before any OTP. A pending dependency refuses execution; a capped blocked dependency must retain three attempts, no-further-attempts status and write reconciliation. No current closure manifest is asserted or fabricated.

The one-hour/campaign-bounded stage holds the inherited actor lock and binds the exact tooling, normal helper, native configuration and original fixture guard. Genuine TLS/IPC ownership and twelve-hour/no-restart supervision are checked before ordinary administrator authentication and before rejection. The reviewed RPC is called once with decision `rejected` and no customer assignment additions. Independent SQL requires only inactive/rejected target state and deactivation of the retained assignment, preserving assignment identity/metadata, old enrollment tokens, business/storage and unrelated accounts. Only the new administrator session is normally logged out after committed-state reconciliation. An uncertain response or preservation failure stops without retry or cleanup. Tokens and OTP remain in memory; recorded phases contain neither.

All 202 tooling tests, changed-source lint, Python syntax and adapter refusal checks passed, including unavailable quota, incomplete closure, extra session, lost committed response and changed business/assignment refusal. Unit challenge values are mocks only. Actual ordinary rejection, populated happy-path integration and subsequent native rejected-login acceptance remain unexecuted: B approval/dependent workflows and their verified closure are still pending. This does not alter the preserved disabled-B pass or constitute reserved-account revocation acceptance.

## Reserved B session-cleanup driver preparation

The ordinary logout driver now supports a distinct fixed-account B session-cleanup stage before the rejected-account workflow. It binds Customer B's exact profile, primary identity, APK 0109 and cleanup purpose, and requires an approved customer with its matched live session. A bounded stage, source/configuration/helper hashes, normal-route TLS/IPC preflight and the shared actor lock precede native actions. The exact enabled avatar, displayed profile name and sign-out confirmation are required; one ordinary logout is followed by two cold login checks and independent SQL proving removal of only that session while all other authentication/business state remains unchanged. Native execution remains pending B's dependent workflows and ordinary login. This preparation does not rerun or reset the capped administrator/reserved-A logout groups.

The logout selection check now queries only `operator_server_v1` through the existing bounded on-device read-only SQLite helper. It no longer copies the complete token-bearing storage database into the driver process. Earlier frozen tooling and evidence remain preserved. All 204 tooling tests, changed-source lint and Python syntax passed; the first test run's misspelled denial marker failure is retained privately. No B logout, OTP, session deletion or native gesture occurred during source preparation. Future logout stages require a fresh ten-minute deadline; historical configurations and frozen inputs are not updated or resumed.

The subsequent populated read-only check with frozen tooling `291cf01` confirmed B is still disabled/inactive and rejects cleanup preconditions. It deliberately paired B with the existing reserved-874 session to verify that ownership mismatch cannot satisfy the matched-session guard; no artificial session was created. Two actual SQL snapshots matched, with no B session, OTP, native gesture or logout attempt. Private proof: `b-logout-populated-refusal01.json`. This is SQL/refusal integration only; it consumes no native cleanup attempt and does not establish the future logout happy path.

## Complete administrator-session preservation

Ordinary role preparation now captures existing administrator session timestamps and an opaque SHA-256 of each full stored row, in addition to its UUID. The guard requires well-formed records, unique IDs and valid issue/expiry ordering, and refuses credential-row or timestamp changes under an unchanged session ID before role commit or cleanup. Shared B approval/rejection snapshots include the same row digest. No refresh token or stored token hash is exported. The role snapshot is a reusable bounded read-only module, included in the exact tooling bindings; future stages must bind that module and use fresh configurations.

All 207 tooling tests and changed-source lint passed, including session-row mutations, malformed metadata, fixed SQL identity, read-only execution bounds and sanitized observer failures. Frozen tooling `f623935` completed populated SQL development under the shared actor lock: two role and two B snapshots matched, all nine existing administrator rows matched across observers, and current role preparation refused the logged-in target. The actual administrator daily quota remained 20/20. No OTP, role/account/session mutation or ADB action occurred. Private proof: `admin-session-row-populated-readonly01.json`. Actual ordinary authentication and role/B workflows remain pending their normal prerequisites; this evidence does not establish native acceptance.

## Fixed approved-B ordinary native login preparation

An explicit approved-B mode now gates the existing ordinary native authentication driver. The exact fictional B profile, customer assignment, primary identity and APK 0109 are fixed. Before OTP, actual SQL must show approved/active customer state, exactly the supported B assignment, no target session and ordinary quota availability. Generic B authenticated admission cannot bypass this mode. The ten-minute stage binds source/configuration, the normal helper and campaign deadline, holds the existing actor lock, and requires real helper readiness and exact installed artifact before ordinary challenge entry. It neither requests a fixed OTP nor resets counters/timestamps.

Post-verification SQL requires one ordinary verified challenge, exactly one newly issued session with valid metadata and row digest, normal quota increments, unchanged target static identity/assignment, unchanged enrollment rows and preserved unrelated authentication/business/storage state. Phone/OTP evidence is redacted by the existing native capture path. All 210 tooling tests, lint, Python syntax and committed-source/history secret scans passed.

Frozen tooling `3eb7e5a` exercised the real pre-OTP SQL observer against currently disabled B under the shared actor lock. It refused before OTP; independent before/after snapshots matched, with no session, ADB action or native attempt consumed. Private proof: `approved-b-before-refusal01-proof.json`. This is populated refusal/source preparation only. Actual administrator B approval, normal native B login and dependent reciprocal customer workflows remain pending their prerequisites.

## B approval helper binding correction

Before ordinary B approval, fixture tooling now rechecks the exact native configuration, helper configuration, owner guard, source files and campaign deadline before each transport, snapshot and private challenge. It requires the original warehouse owner, an undelayed normal route, the expected supervisor bridge source, no restart and the existing twelve-hour cap. No frozen helper inputs were edited. Actual guard-only checks accepted the current released bindings and refused changed native and owner-guard digests before OTP, SQL or ADB. All 210 fixture tests and changed-source lint passed. Private proof: `b-approval-bindings-guard-only01-proof.json`. Ordinary approval remains unexecuted behind its natural administrator quota gate.

## Genuine B image fixture preparation

Fixture-only tooling now prepares one deterministic 64×64 RGB PNG on real B receipt `FXC702` (`a24c256a-bdf3-11f1-97aa-57de57b8fb69`). It uses one ordinary administrator OTP/session and the existing registration, new-object upload and confirmation APIs. Exact APK0109, receipt/customer/admin identities, PNG bytes, source/configuration, original owner, normal TLS/IPC helper and the twelve-hour supervisor cap are bound. The shared actor lock and a fresh deadline of at most one hour are required; no internal session issuer is used.

The driver requires a fresh private, checksummed/readable database/storage backup proof bound to the current full observer snapshot. It refuses a pre-existing target image or exhausted quota before OTP/attempt creation. Each write is marked before sending, then independently reconciled before another write. All earlier image/object metadata and unrelated business/authentication rows must remain identical. The new object's actual downloaded bytes must match the fixed PNG SHA-256 before and after confirmation; overwrite is disabled. Only the new administrator session is logged out after final reconciliation. Uncertain registration/upload/confirmation retains state and attempts without replay, deletion or automatic logout.

Source checks cover the successful mocked adapter sequence, quota/backup/deadline/input refusals, old-object and session preservation, and uncertain responses at all three writes. All 215 fixture tooling tests, changed-source lint and Python syntax pass. The populated read-only observer and executable normal-authentication happy path require separate evidence. No image has been registered/uploaded/confirmed by this preparation checkpoint, and this tooling does not establish native upload, rendering or reciprocal image denial.

For a fresh attempt, bind the nine files named by `fixture-b-image-api.mjs`, `soakConfigSHA256`, `helperConfigSHA256`, the private image file and proof hashes. A proof must identify the original primary state/instance, `baselineSnapshotSHA256` (SHA-256 of `JSON.stringify` on the full `bImageSnapshot` result), `verifiedUTC` within one hour, and two private files of kinds `database`/`storage` with exact SHA-256 values, plus verified checksums and readable archive catalogs. Create and independently verify the real backup before setting `preservationVerified`; never fabricate a proof. Write the PNG from `bFixturePNG()` to a new private file. Execute the frozen `fixture-ui/b-image-api30.py` with the Docker group only after normal quota and ownership gates pass. Keep every failed directory immutable.

Frozen tooling `c24e6e75fe3a087e423775a5e8313d0b0f0aebe9` subsequently passed populated read-only integration under the shared actor lock: two identical SQL snapshots confirmed the genuine B receipt/customer, no target images and all 13 existing stored-object metadata rows. The actual administrator daily quota remained 20/20 and the pre-OTP guard refused it. No OTP, session, write, upload or ADB action occurred. Private proof: `b-image-populated-readonly01.json`. The executable upload and its fresh backup remain pending the natural quota window.

## Prepared preservation and reciprocal-B identity correction

Private bounded backup preparation binds the unchanged primary backup/compose/ownership scripts, current normal-helper/native configuration and frozen B-image observer source. It holds the existing actor lock and requires genuine TLS identity, original ownership, the twelve-hour supervised helper and a fifteen-minute operation bound. Execution will use the documented consistent backup, verify all checksums/readable database and storage catalogs, and require identical before/after SQL before producing an upload prerequisite. Its actual guard refused the still-exhausted natural administrator quota before backup directories, service stops, OTP or uploads. Earlier preparation remains preserved. Private proof: `primary-before-b-image02-preparation-proof.json`; executable preparation: `preserve-primary-before-b-image02.py`. No backup has been created by this preparation and no restore is authorized.

Review found that the prepared reciprocal receipt and invoice observers paired B's fixed profile UUID with the reserved customer's `874` phone. This would produce a null profile even after legitimate B approval. The shared fixture-only SQL now pairs both exact B read modes with the genuine `873` phone; the reserved A customer remains paired with `874`. Wrong identities and mixed modes still refuse. All 216 fixture tests and changed-source lint passed. Populated integration and native acceptance remain separately required; no OTP/native attempt was consumed by this source correction.

Frozen source `827704293201de93b9a3f569cc811668a6abaaae` passed actual populated integration under the shared actor lock. The preserved old query returned a null B profile; corrected receipt and invoice queries both returned the genuine disabled B profile. Repeated corrected snapshots matched, and business/authentication/OTP/session observations matched the old query. Disabled B and the deliberately mismatched existing reserved-account session still refused admission. Private proof: `reciprocal-b-phone-populated01.json`. No OTP, native attempt or ADB action occurred.

## Authorized native B image rendering preparation

A separate read-only native driver now binds genuine Customer B, receipt `FXC702`, exact APK0109 and the real confirmed result of the guarded B-image preparation. The new mode cannot mix with receipt/invoice denial, logout or another customer mode. It requires the actual B phone/profile, active customer session and assignment, one confirmed image and stored bytes matching the deterministic PNG. Missing/pending/fabricated preparation evidence refuses before any native attempt.

The ten-minute stage binds seventeen source files, native/helper configuration and the campaign deadline, and uses the existing actor lock, exact owned API30/installed APK, normal TLS helper and unchanged twelve-hour cap. It opens the shipped receipt Images tab without upload/edit/delete actions, requires the actual matching signed-image GET200, and decodes two screenshots with the existing Pillow 10.2.0 runtime. Sixteen alternating checkerboard samples must match in one visible square; solid colors, wrong patterns, ambiguous regions and wrong screen dimensions refuse. Evidence records sanitized status counts and pixel bounds/hashes, never signed URL tokens. A normal B cold Orders200 and unchanged SQL plus complete stored-file hashes are required afterward.

All 219 fixture tests, changed-source lint and Python syntax passed. Source tests are prepared-driver evidence only. The genuine upload, normal B approval/login, populated image observer and actual native rendering remain unexecuted. This case establishes authorized rendering when run successfully; API/native upload and reciprocal image denial remain separate acceptance requirements.

The screenshot source tests declare their decoder dependency in CI (`python3-pil`) and use `/usr/bin/python3`, so they do not rely on incidental runner packages. Native pixel evidence records the actual decoder version. On this VM the existing decoder is Pillow 10.2.0; no package installation or application rebuild was needed.

## Native B GRN PDF/SEND/reader preparation

A distinct document driver now binds Customer B, genuine receipt `FXC702` and exact APK0109. It uses the shipped existing-record Overview/Share PDF flow, without creating an invoice, receipt, dispatch or stock change. The independent read-only query requires the actual approved/active B session and active B assignment, preserves all unrelated authentication/business/storage metadata, and allows exactly one new document under the genuine GRN UUID prefix. All earlier stored files and document rows must remain unchanged; stored, native-downloaded and approved reader-export bytes must match.

The ten-minute stage binds twenty-three source files, native/helper configuration, the approved original document-capture/reader manifest and campaign deadline. It holds the shared actor lock and verifies exact installed fixture/reader bytes on the original approved disposable API30 emulator. Generation is marked before one native Share PDF gesture. A failed/uncertain generation preserves its document, cache and chooser without regeneration or replay. Only a successful immutable preparation permits one approved Librera SEND selection, followed by the existing scroll-mode/view/export checks. No reader permission or remembered-choice change is made. Separate final reconciliation restores normal B cold Orders200 and public server selection, then verifies unchanged state and the same document.

Source checks refuse another customer/receipt/artifact, mixed modes, inactive/unmatched sessions, inactive assignments and wrong PDF text. All 222 fixture tests, changed-source lint and Python syntax passed. Populated SQL development and the actual normal B authentication/generation/reader happy path remain separate evidence; no document was generated by this source preparation. Reciprocal PDF transport denial and invoice arithmetic remain independent requirements. This does not rerun the exhausted saved-invoice/GRN navigation case or transfer the prior A rounding-PDF result.

Frozen source `0111d6d75def29a64202f90c8c9b2409a79a35aa` passed populated read-only development under the shared actor lock. Two identical snapshots found the genuine B header and zero existing documents under its actual GRN prefix. B remained disabled/inactively assigned with no matching B session; admission refused those real prerequisites. The existing reserved-account session was deliberately mismatched only for refusal checking, never transferred. Private proof: `b-grn-pdf-populated-readonly01.json`. No OTP, PDF, native attempt or ADB action occurred.

## B fixture and native document results, 2 October 17:15 UTC

A consistent private primary backup passed checksums, database/storage catalog readability and exact protected SQL comparison before ordinary administrator preparation. No restoration was performed. The natural authentication window opened without counter changes. One ordinary administrator login registered/uploaded/confirmed the deterministic B header image; independent final SQL confirmed the intended object and removal of only the new administrator session. A separate ordinary administrator login approved B while preserving the image, business data and unrelated sessions.

The third and final original-customer logout attempt passed ordinary sign-out, session removal, persisted warehouse selection and two cold login requirements. B then authenticated through one ordinary native OTP request; independent SQL confirmed one new B session and preserved unrelated state.

Authorized native B image rendering is **BLOCKED at three attempts**. Attempt 1 stopped during tab capture, attempt 2 at a navigation-only selector restriction, and attempt 3 at a missing driver method after image filters appeared. All attempts and source corrections are preserved; independent SQL and complete stored-file reconciliation passed after each. No fourth attempt is permitted. API fixture upload is PASS; native pixel acceptance is unproven.

B GRN FXC702 native PDF acceptance is **PASS, scoped** on APK2026100109/source696165f with toolingf3cc36a. The first preparation refused an invoice-only preservation configuration before generation; exact SQL/document/storage comparison passed. Corrected preparation generated one private GRN document, downloaded matching bytes and reached actual Android SEND. The approved original-emulator Librera target received the document and opened Scroll mode. Export SHA-256 matched stored and native downloaded bytes: `9c3234039a9cac6b442eba5d2729e0a21551582c1cbfa2af7329b9955ff22f12`. Extracted text contained FXC702 and Backend Test Customer B, with no A customer content. Final B cold Orders HTTP200, persisted core identity, protected SQL and stored-document reconciliation passed; no additional OTP, regeneration or permission change occurred.

Private evidence is retained under campaign stage ledgers for B image API, B approval, original-customer logout v3, approved B native authentication, B image attempts01–03, and B GRN PDF preparation02/reader selection/open/final reconciliation. This proves authorized B GRN PDF behavior only; reciprocal document denial, invoice arithmetic, remaining business cases, final freeze/soak and dedicated expiry appointment remain separate. Exact CI for previous documentation head1ccbb2a completed: Android artifact audit, lint/types and redacted scans PASS; dependencies FAIL. Published toolingf3cc36a CI37038666490 was still running at this checkpoint.

## Reciprocal B-to-A native record isolation, 2 October

Both native denial cases passed on APK2026100109 with the actual approved B session. A genuine A receipt FXC701 produced Failed to Load / GRN not found or access denied; no A receipt/customer content appeared. A genuine A invoice20261010 produced Error followed by Invoice Not Found; no A content, Share PDF, amount or Breakdown controls appeared. Each case observed its real RPC HTTP200, then restored B Orders through a cold read with HTTP200. Independent SQL preserved target identity, business, unrelated authentication, OTP baseline and the admitted B session. Receipt toolingf3cc36a and invoice tooling0d73d02 are recorded separately. The invoice driver uses a unique enabled OK button only in its actual Error dialog, preserving server-navigation admission rules. These record denials do not establish direct private PDF/image transport denial or staff/Realtime isolation. Private stage ledgers and before/after/native denial proofs are retained.

## B-to-A private invoice transport, 2 October

Tooling5009cc9 executed one ordinary fictional B API OTP/login while preserving the existing native B session. The actual A invoice20261010 PDF storage row, A customer ownership, absent B assignment and stored bytes were independently verified before authentication. A direct private documents-bucket GET was denied; B generation of the A invoice PDF returned404. No PDF bytes were exposed, no new document was created, and every denied request was independently reconciled against protected SQL and complete stored-file hashes. Only the new API session was logged out after successful reconciliation; independent final SQL confirmed the native B session and old state remained. The immutable stage ledger and sanitized HTTP statuses are private in stage-b-private-document0109-01-evidence and ordinary-b-private-document0109-01. Populated SQL development, three workflow refusal/no-replay tests and syntax checks passed. This is a B-to-A existing private invoice transport PASS only; A-to-B document transport, private images and staff/Realtime boundaries remain separate. No broad state-changing backend suite was rerun.

## A-to-B private GRN transport, 2 October

Reciprocal tooling5123eb3 passed live against the existing B GRN FXC702 document. Its populated SQL observer verified the storage row, actual B ownership, no A assignment, matching stored PDF bytes and the valid native B session before one ordinary A API OTP/login. Direct private B document GET returned400; A generation of B GRN PDF returned404. Protected SQL and complete stored-file hashes reconciled after each request and independently after only the new A API session was removed. No PDF bytes, new object or business change occurred; native B state remained. Evidence is retained in stage-a-private-b-grn0109-01-evidence and ordinary-a-private-b-grn0109-01. Three reciprocal workflow tests, syntax checks and real repeated populated snapshots passed. The preceding full setup/tooling run passed225 checks; the three new reciprocal checks are additional until a new full run confirms the aggregate. This complements the B-to-A invoice transport result without establishing private-image, staff or Realtime isolation. At17:41UTC the owned emulator had no ANR/crash and the monitor reported no resource pressure; the48-hour deadline remains3October16:27:13UTC.

## A-to-B private image transport, 2 October

Tooling156854d passed ordinary A access-denial checks against the genuine confirmed B header image for FXC702. Populated SQL verified confirmed/no-upload-token metadata, the actual storage row, B customer ownership and no A assignment; stored160-byte PNG SHA matched the immutable fixture preparation proof. One ordinary A API login then attempted direct object GET and signed-URL POST: both were denied. Protected SQL and complete stored-file hashes reconciled before and after each request and independently after removing only the new A API session. Native B session, business data, the image and existing documents were preserved; no image bytes or signed URL were accepted. Private evidence is retained in stage-a-private-b-image0109-01-evidence and ordinary-a-private-b-image0109-01. Source workflow tests, syntax and populated observer checks passed. This independent API transport case does not retry or establish the blocked native image rendering case; B-to-A image transport requires a genuine A image and remains untested.

## Current tooling and CI correction, 2 October

The full documented setup/tooling suite passed231 tests after private-image integration. Exact prior CI37043008068/head1e6e18b completed source/history scans PASS, dependencies FAIL, lint FAIL and Android job FAIL. Lint errors were confined to new mocked tests: structuredClone was absent from the configured lint globals and a body parameter was unused. The tests now use globalThis.structuredClone and omit that parameter; changed-source lint and all9 affected no-replay/refusal tests pass. The Android job stopped during pinned NDK27.0.12077973 acquisition with ZipFile unknown archive, before artifact auditing. The failed log is preserved privately; this is not a compiled artifact failure or a readiness PASS. Current a794b46 CI37043682017 remained running at review. The dependency gate remains unresolved. No VM build, quota reset, runtime-input edit or additional native rendering attempt was performed.

### Reciprocal Realtime isolation, APK 2026100109

The independently authenticated A, B and administrator subscriptions passed the
live reciprocal isolation case using frozen tooling `05a2542`. Two normal
administrator updates changed only the notes of the existing fictional A/B
carts. Original notes and complete cart rows were preserved privately before
writes. Each update reconciled against independent SQL and full stored-object
hashes; unrelated business and authentication state remained unchanged.

A received its own update and no B update; B received its own update and no A
update; the administrator received both. Subscriptions remained live throughout
the bounded observation and native phase, with heartbeat acknowledgement guards.
Native B retained its single B-only Orders card and performed a fresh successful
Orders RPC after the event without manual refresh. Notes are not displayed on
that card: this evidence establishes native event-driven refetch, rather than
claiming visible note rendering. Final acceptance and cleanup reconciled; only
the three newly issued API sessions were logged out. The original native B
session and all pre-existing administrator sessions were preserved.

Private evidence: `vm-campaign-20261001/realtime-isolation0109-01/`, including
`result.json`, `original-notes-and-state.json`, per-write snapshots,
`wire-isolation.json`, native phase results and `final-acceptance.json`.
No retry, automatic rollback, quota reset or additional native login occurred.
This result does not complete the remaining staff, business, switching or final
soak acceptance gates.

### Ordinary B logout, rejection and native denied login

After the receipt, invoice, private-document and reciprocal Realtime dependencies
passed, the existing B native session was signed out through the normal UI.
Frozen tooling `22c125e` verified the exact APK, owned API30, current normal
helper, supported profile controls, one confirmed sign-out, two cold launches
requiring login, persisted public server selection and independent SQL showing
only the matched B session removed. Evidence: `native-b-logout0109-01/`.

The normal administrator `operator_review_enrollment` API then rejected B using
an evidence-bound closure of the completed dependency cases. One ordinary
administrator OTP/login preceded one supported rejection. SQL confirmed B
inactive/rejected, its assignment inactive and no B sessions, while unrelated
authentication/business state and old administrator sessions remained unchanged.
Only the new administrator session was logged out after reconciliation.
Evidence: `ordinary-api-b-rejection0109-01/b-rejection-preservation.json`.

Frozen tooling `794a197` applied the existing bounded source/helper/deadline
guards to rejected-B authentication. One ordinary native B OTP attempt produced
Verification Failed, followed by a cold launch requiring login. Independent
before/after observations confirmed no new session, unchanged rejected profile,
retained enrollment token/assignments, and unchanged unrelated authentication
and business records. Evidence: `native-auth-rejected-b0109-01/`. No quotas,
credentials or timestamps were reset; B remains rejected and logged out.

### Supervisor preparation and unsaved customer draft cancellation

The logged-out reserved account was prepared as supervisor through the normal
administrator `update_user_role` API using frozen tooling `115886b`. One ordinary
administrator login and one role update reconciled before logout; only that new
API session was removed. Existing administrator sessions, target assignments,
other authentication and business records were preserved. This was a prerequisite
for previously unexecuted draft cases, rather than a rerun of an exhausted case.
Evidence: `reserved-supervisor-draft-prerequisite01/`.

One ordinary native supervisor login issued exactly one reconciled session.
Evidence: `native-auth-reserved-supervisor0109-03/`. The dedicated expiry test
still requires a separate owned AVD and final frozen artifact; this session does
not constitute that appointment.

The first real unsaved customer-master form cancellation passed on APK9. The
native form contained `Fixture VM0109 unsaved customer` without submission;
genuine switching-warehouse discovery and Use prompted the server-change dialog.
Cancellation returned to the original form with the exact draft retained in two
observations. Public core selection persisted, then a normal cold restart
abandoned only the in-memory draft and performed a fresh successful Orders read.
Independent SQL confirmed business, profile, unrelated authentication and OTP
state unchanged and the native supervisor session retained. No save or additional
OTP was attempted. Evidence: `native-unsaved-customer-draft0109-01/`.
Invoice, GRN and dispatch draft cases remain separate unexecuted acceptance work.

### Invoice draft cancellation and first GRN draft attempt

The first native unsaved invoice-header case passed using frozen tooling
`115886b`: invoice number `20261991` was entered without submission, retained
through genuine switching-instance discovery and cancellation, and observed
again after returning to the form. Core public selection persisted. A normal
cold restart abandoned the local draft, followed by successful Orders HTTP200
and independent unchanged business/authentication/OTP reconciliation. Evidence:
`native-unsaved-invoice-draft0109-01/`. No invoice was saved.

The unexecuted GRN driver was first corrected to open `grn-form/step1` and admit
its exact generated value before editing. Its first native attempt, frozen
`4f8a00b`, then failed waiting for the nonexistent `Enter receipt number` label,
before any draft edit or submission. Actual source exposes `Receipt number`.
The failed attempt is preserved in `native-unsaved-grn-draft0109-01/`; a separate
read-only after observation passed against its before snapshot, confirming
unchanged protected business/profile/authentication/OTP state and retained native
session. Review correction `61eaeeb` uses the actual accessibility label and
passed syntax/control tests. No corrected native rerun has occurred yet; at most
two corrected reruns remain for this campaign. Generated-number acceptance must
still pass against the actual field before any edit.

### Corrected GRN and dispatch draft cancellation; exact review CI

The first corrected GRN rerun passed using frozen tooling `729be7d`. Actual
Receipt number/default A0001 admission preceded entering FXS991 without save.
Genuine switching discovery, Use and cancellation preserved the draft, core
selection and supervisor session. Cold cleanup and fresh Orders HTTP200 were
followed by unchanged independent state reconciliation. The first failed attempt
and its after reconciliation remain preserved. Evidence:
`native-unsaved-grn-draft0109-02/`.

The first dispatch-notes draft case also passed with tooling `729be7d`. The
supported optional-fields control exposed notes; the exact fictional draft
survived genuine switching discovery and cancellation. No customer/stock
selection, submission or additional OTP occurred. Cold cleanup, Orders HTTP200
and unchanged independent state reconciliation passed. Evidence:
`native-unsaved-dispatch-draft0109-01/`.

Private `four-draft-cancellations0109-final-proof.json` binds the actual customer,
invoice, GRN and dispatch PASS results. These cover cancellation with unsaved
forms; confirmed switching, in-flight requests/uploads/saves and expiry remain
separate requirements.

Exact mobile review CI `37047636531` at `22c125e8dfdac2603b449218d969d1dc7c2f8dcc`
completed: Android debug artifact audit, lint/typecheck and redacted source/history
scans PASS; dependencies FAIL. The CI debug artifact result is separate from the
installed standalone release APK9 and does not waive the dependency gate or
establish final readiness/soak acceptance.

### Native zero and excess dispatch-item quantity rejection

A distinct non-submitting native case tested the existing create-item quantity
admission contract on the genuine FXF410 lot (quantity/stock20), with supervisor
session and exact APK9 bindings. The first attempt `cd1381e` stopped after zero
entry because the general input helper expected visible 0. Independent full SQL
and stored-file reconciliation passed before cleanup or rerun. Actor-locked
read-only diagnosis confirmed the actual field renders zero as the Qty placeholder
with Save disabled, matching the application source. Failed evidence remains in
`native-dispatch-quantity-rejection0109-01/` and its private diagnosis.

The first corrected rerun, frozen tooling `6aae486`, passed actual native zero
and21 admission checks. Explicit zero entry rendered the empty/Qty field with
Save disabled;21 rendered as21, displayed Quantity exceeds available stock (20)
and kept Save disabled. No item save, dispatch submission or OTP occurred. The
independent before, after and post-cold-cleanup snapshots were identical: stock20,
no FXQ991 record, valid native supervisor session, complete business/authentication
hashes and all stored-file hashes preserved. Normal-route cold Orders200 passed.
Evidence: `native-dispatch-quantity-rejection0109-02/` and
`dispatch-quantity-rejection0109-final-proof.json`.

This case establishes native invalid/excess item admission. It does not replay
an exhausted lost-response/normal-dispatch case, issue an excess API write, or
establish concurrent submission, receipt invalid-quantity or queue processing.

### Actual supervisor Realtime delivery and customer isolation

Frozen tooling `51f685f` passed the distinct supervisor Realtime case on APK9.
The actual backend staff policy permits admin/supervisor; this case uses the
explicit supervisor role, not literal staff or an administrator substitute.
Ordinary A, supervisor and administrator API logins were independently reconciled
while preserving the existing native supervisor session and old administrator
sessions. Original full cart rows/notes were preserved before two normal
administrator note updates; each update reconciled against protected SQL and
complete stored-file hashes.

Live supervisor and administrator subscriptions each received both cart events;
A received only A, no B and no unexpected events. Heartbeat-backed live checks
continued through observation and native evidence. The native supervisor showed
both genuine customer cards and Queue navigation, then performed a fresh Orders
RPC200 after the event with no manual refresh. Final state reconciliation passed,
followed by removal of only the three new API sessions. Rejected/logged-out B,
unrelated authentication/business records, stored objects and the original native
supervisor session remained unchanged. Evidence: `supervisor-realtime0109-01/`
and `supervisor-realtime0109-final-proof.json`.

The frozen adapter's terminal stdout retained a generic reciprocal-isolation
label from shared tooling. Role-specific `final-acceptance.json`, live counts and
native proof define the actual acceptance scope above; review source corrects
that stdout label. This result does not establish queue processing, concurrent
writes or literal-staff access, and does not transfer the earlier B-native case.

### Current tooling verification runtime

After quantity-rejection and supervisor Realtime integration, redacted source
and complete-history scans passed. An initial setup-suite invocation accidentally
used system Node18.19.1:247 tests were reported,241 passed and6 failed, including
unsupported TypeScript loading and ESM require errors. Its private log remains
`quantity-supervisor-setup-tests01.log`; this failed verification is not erased.
The exact documented fixture Node runtime then ran the full suite successfully:
253 tests PASS,0 failures. Evidence:
`quantity-supervisor-setup-tests02-node22.log`. Use the documented runtime/PATH
for reproduction; the unsupported-runtime result does not establish an
application regression or waive any artifact/dependency gate.

## Queue preparation checkpoint, 2 October 19:25 UTC

An actor-locked, ownership-guarded read-only inventory independently read the
primary fixture twice with identical results. The preserved ordinary API cart
has one FXC701 line requesting two units, with eight in stock. The current
native supervisor session is valid and proposed dispatch FXQ992 is absent.
Private `queue-processing-readonly-inventory01.json` preserves the complete
order/line/lot precondition; no OTP, application write or dispatch occurred.

Review tooling now binds that exact lot and order-item identity, rejects changed
quantity/stock/session/ownership and refuses changes during preparation. Two
JavaScript guard tests PASS, including provenance and hidden-state drift
refusals. The guards also passed against the actual preserved inventory.
Existing two Python selector tests cover queue expansion and generation
controls. These are preparation evidence only: native queue processing remains
unexecuted, and its SQL/storage observer and submission orchestration are
still required. The cart remains explicitly API-created; this is not another
native cart-creation attempt or a native cart PASS.

The next queue observer checkpoint captures the exact target receipt, cart,
line, lot, dispatch lines and stock movements in a bounded repeatable-read
read-only transaction. Full business and authentication hashes and sorted
stored-file byte hashes protect preparation. The observer ran twice against
the owned live fixture under the actor lock; both complete snapshots were
identical. Private `queue-processing-full-snapshot01.json` preserves the
actual SQL/storage result. Three JavaScript tests PASS (two fixture guards and
one stored-byte change/symlink refusal test). No native queue action, OTP or
application write occurred. Commit reconciliation and bounded native
submission orchestration remain unfinished; no queue-processing PASS is
claimed.

Queue reconciliation source now checks exactly one matching dispatch, line,
stock movement and cached success; stock eight to six; only the matched cart
line removed; persistent order still OPEN; unchanged order notes and source
receipt fields except legitimate update audit columns. Per-row hashes across
16 business/storage tables protect every unrelated row, while complete auth
and stored-byte hashes remain unchanged. Five JavaScript tests PASS, including
duplicate/wrong-stock/stale-cache/unrelated-state refusals. The expanded
observer independently captured identical live preconditions twice, preserved
in private `queue-processing-full-snapshot02.json`. Commit reconciliation has
unit evidence only: no native dispatch has occurred, and orchestration and
actual successful-response reconciliation remain required.

The source-bound queue observer and native driver are now implemented: exact
artifact/AVD/TLS/release/deadline checks, genuine queue expansion/generation,
review of FXC701/8 and two units, unchanged preparation, one confirmation,
independent SQL commit reconciliation and cold Orders/empty-queue evidence.
Failed reconciliation retains the actual snapshot and prohibits replay.
Source syntax checks pass. This orchestration is not yet executed; its live
result remains open. Existing failed native cart cases are unaffected.

The first native queue attempt (frozen54b8d8c) reached genuine queue expansion,
dispatch generation and correct FXQ992/FXC701/8/two-unit review, then refused
the customer selector before any confirmation or submission. Actual review
uses `To: Backend Test Customer A`, rather than the header's bare name.
Private `native-queue-processing0109-01` and read-only review diagnosis are
preserved. Independent full SQL/auth/stored-byte reconciliation PASS against
the initial snapshot; no OTP or operation occurred. The exact review selector
is corrected in review source, including foreign-customer/quantity refusals.
This is one initial failure; at most two corrected reruns remain, and no
queue-processing acceptance is transferred from preparation.

## Native queue processing PASS, 02 October 19:40 UTC

Frozen71fd3da corrected attempt02 PASS: genuine Queue expansion and Generate
dispatch, exact FXQ992 / FXC701/8 / two-unit review, unchanged preparation,
one native confirmation and success. Independent SQL proves exactly one
dispatch, matching line, stock movement and its own cached success. Stock8
to6; only matched order item removed; persistent cart remains OPEN. Cold
launch produced Orders200 and `No Orders in Queue`. Full auth/stored bytes
and every unrelated row in the protected business/storage tables are
unchanged. Private `queue-processing0109-final-proof.json` binds all evidence,
config/source/artifact and the preserved initial failure/reconciliation.
There were two native attempts, one total submission and zero OTP requests.
No replay occurred. This accepts native queue processing of the preserved
ordinary API-created fixture; exhausted native customer cart creation remains
BLOCKED and is not rerun or reclassified.

Current-head CI37055632071 (b9fa7a0) found a test-source lint error: three
unqualified `structuredClone` references lacked the configured global
declaration. Review tests now use the established `globalThis.structuredClone`
form. This changes no runner, native artifact, business state or acceptance
evidence. The failed CI remains preserved; source validation follows before
publication. Its source/history scan PASS; dependency gate FAIL; Android
audit was still running when inspected.

After the test-only global qualification, full source lint PASS and all258
setup/fixture tests PASS under documented Node22. Private logs
`queue-current-source-lint01.log` and `queue-current-setup-tests01.log` retain
complete output. No application/runner input or native evidence changed.

## Receipt fractional quantity source correction

Review found that GRN item admission and pre-schema conversion used
`parseInt`, turning entered1.5 into1 before the existing integer validator
could reject it. Recorded installed application source696165f contains that
path. Review source now uses the existing quantity schema for Save admission
and preserves the entered numeric value through validation and both item-save
and Review navigation. This changes no API or database schema and introduces
no new business rule. Ten focused tests reject empty/zero/negative/fractional/
malformed/nonfinite inputs and preserve ordinary positive whole counts.
Full application tests313/49suites PASS, full lint PASS and TypeScript PASS
under documented Node22. Private logs `receipt-quantity-full-app-tests01.log`
and `receipt-quantity-source-validation01.log` retain results.

This is source-only verification. Installed APK9 remains byte-identical and
retains its original source behavior; no native invalid-receipt PASS is
claimed. A new audited artifact and native zero/negative/fractional acceptance
are required. Disk remains below the25GiB new-build floor; no floor waiver or
unrelated cache/state deletion occurred. Existing receipt attempt caps remain
unchanged; this is the distinct invalid-quantity workflow, not a fourth
receipt-creation or lost-response attempt.

## Build-space prerequisite recovered through local preservation

Six obsolete owned generated intermediate trees (build2026100101–0103 and
2026093012–3014) were preserved in private local archives. Before retirement,
ownership/no-symlink and absence of private JSON plan references were checked.
Every archived file's bytes and catalog matched its original; six standalone
APK hashes remained unchanged. Only verified redundant generated intermediate
copies were retired. Current build0109, source checkouts, standalone artifacts,
warehouse/AVD state, credentials, transactions, failures and old-soak evidence
remain preserved. No archive transfer or restore occurred.

Private preservation01/02 manifests and
`build-space-after-preservation01.json` bind all checks. Disk now exceeds the
25GiB new-build floor (approximately25.37GiB); no new build has started.
The source receipt fix still requires clean build/install/audit/native
verification. Current source CI37056571885/c422f62 has lint/typechecks and
redacted scan PASS, dependency FAIL, Android audit still running. No final
readiness, soak or expiry-freeze claim is made.

## Fresh receipt-fix candidate build2026100110 started

Unused increasing identifier2026100110 is allocated to a clean detached
checkout of application/tooling c422f62. Fresh `npm ci` PASS; all eight
nondependency source gates PASS (application/setup tests, lint, typecheck, SDK
compatibility, Expo Doctor, redacted scan and exact backend contract). The
dependency audit remains independently BLOCKED; there is no waiver. Three
certificate inputs are copied explicitly and bound; no application overlays.

Further obsolete owned generated library build/.cxx outputs were privately
archived and every content checksum/catalog verified before redundant copies
were retired. Package sources, standalone APKs, current build0109 and all
warehouse/native/evidence state remain preserved. Private library-preservation
01/02 manifests retain these checks. The exact owned APK9 AVD was then stopped
cleanly without logout/wipe/restore/reboot, and its complete stopped storage
archive passed checksum/readable catalog.

Private build0110 guard passed at25.2179GiB free with no competing emulator or
Gradle actor, current helper discovery and binding integrity. SDK/certificate
horizon/prebuild/native trust PASS; capped x86_64 release Gradle is RUNNING.
The new APK is not yet audited or installed, and no native results transfer.
Final readiness, soak and dedicated expiry appointment remain open.

Receipt quantity native selectors are prepared for build2026100110 source
c422f62 only: exact entered0/-1/1.5, selected fictional item and disabled
Save receipt item, with ambiguity/truncation/enabled-save/confirmation refusals.
Two focused Python tests PASS. These are source tests only; the receipt
observer/driver and actual native execution still await the audited new APK.
The build remains RUNNING. Monitor20:08UTC flags low swap during the bounded
build; no emulator or additional heavy work is running. No build/native PASS
is inferred from partial progress.

## APK10 compiled audit and owned installation PASS

Clean source c422f62 produced standalone x86_64 build2026100110. Exact SHA256
`a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69`.
Compiled audit, signature/package/version/ABI, bundled JavaScript, picker
RN_SERIALIZABLE_STATE compile audit and all three fictional trust anchors
PASS. Private build0110 retains commands, overlays, bindings and artifact.
The build completed without competing native actor. Resource pressure during
compile was caused by available RAM below the monitor's3GiB threshold; low
swap was observed but is not that monitor's pressure predicate. Memory
recovered after build completion before restart.

The original owned AVD restarted under new capped supervisor
`warehouse-fixture-emulator-vm2026100110-01.service`; exact stopped archive
remains retained. Default shell UID/base hosts after boot were reconciled,
then only proven prior root and two fictional bind mounts were restored,
without remount/verity/reboot changes; SELinux remains enforcing. APK10
installed in place after private app-storage preservation. Installed
read-back SHA matches the exact audited artifact; normal fictional TLS and
old APK identity were independently checked before upgrade. Separate
`emulator-inputs0110.json` / `native-config0110.json` retain bindings. No
logout, wipe, clone or restore occurred.

Read-only monitor19 now watches the new supervisor; monitor18 logs/config are
preserved. No native APK9 result transfers to APK10; cold authenticated
readiness and native invalid-receipt acceptance remain pending. Dependency
gate stays BLOCKED, and final readiness/soak/expiry appointment remain open.

Receipt SQL/storage observer source is prepared for the exact corrected
source/version and passed two refusal tests plus focused lint. It protects
receipt/stock/cart/dispatch/invoice/image/cache/movement/customer/item/storage
rows and all authentication rows, plus actual stored-byte hashes. Live
observer and native driver execution remain pending; no invalid-receipt PASS
is claimed.

Receipt invalid-quantity observer/driver are now implemented with exact APK10
source/version, owned fixtures/helper and transitive tool hashes, release
checks, at most ten-minute deadline and one native actor. Genuine GRN header
and catalog selection precede entered0/-1/1.5 and disabled-save captures;
there is no item save, receipt confirmation/submission or OTP action. Full
protected SQL/auth/stored-byte snapshots surround the case and cold normal
Orders cleanup; failed reconciliation retains the snapshot without replay.
Syntax and focused lint PASS. Four pure source tests (two Python/two JS)
previously PASS. Live native attempt remains pending at this checkpoint.

## Native receipt invalid quantities PASS, APK10

Frozen10ee710 first native attempt on exact APK10 PASS: genuine GRN header
FXV991/customerA/catalog selection, entered0/-1/1.5, each exact displayed
quantity and Save receipt item disabled. Private native XML independently
confirms all three values and disabled controls. No item save, receipt
confirmation/submission or OTP occurred. Full protected SQL/auth/stored-byte
before/after/final snapshots are identical, including retained valid reserved
supervisor session. Normal cold cleanup produced actual Orders200.
Private `receipt-quantity-rejection0110-final-proof.json` binds source,
artifact/config and every evidence file. One attempt, zero saves/submits/OTPs.

This verifies the source fractional-truncation correction natively on APK10
and zero/negative admission. It does not establish normal receipt creation,
image upload or lost-response acceptance, and it does not reopen exhausted
receipt cases. APK9 acceptance remains historical and scoped; no result
transfers. Dependency/readiness/native remaining gates, soak and dedicated
expiry scheduling remain open.

Latest published-head CI37060527407/dd0d59b has lint/type and redacted source/
history scan PASS, dependency FAIL and Android audit still running when
inspected. All260 setup/fixture tests PASS locally after native receipt
acceptance (private `receipt-native-complete-setup-tests01.log`).

Controlled native concurrency remains unexecuted. Backend review now contains
a disabled-by-default five-second maximum matcher for one declared native
dispatch/account/customer/lot/quantity, with two refusal tests PASS. Active
helpers are unchanged; transport integration, genuinely fresh fixture,
ordinary API competitor and native/SQL reconciliation are still required.
No OTP, fixture provisioning or dispatch occurred in this preparation.

Fresh concurrency acceptance controls bind APK10, supervisor 874, administrator 871, fictional Customer A, new receipt FXQ993 and separate native/API dispatch numbers FXQ994/FXQ995. They require fresh three-unit stock, a measured single five-second hold, competitor-only two-unit commit, one stock movement/cache, final stock one, preserved native session and unchanged unrelated/auth/storage hashes. Three source tests passed, including duplicate-commit, reused-stock, artifact, timing and protected-state refusals. UUIDs in source tests are synthetic only; no genuine fixture has been provisioned and native/API execution remains pending.

Concurrency reconciliation source now collects an isolated repeatable-read, read-only SQL snapshot with a ten-second statement timeout and fifteen-second subprocess bound, plus actual stored-file hashes. It binds the exact new receipt/lot, dispatch headers/lines, stock movement and successful cache, and protects unrelated rows and authentication state. Acceptance controls additionally check winner ownership, exact lot and unchanged lot metadata. Three focused controls tests and snapshot syntax passed. Populated SQL validation, fixture provisioning, helper transition and native/API execution remain pending; this is not native acceptance evidence.

The concurrency SQL executed twice successfully against the actual populated primary fixture after original checkout hash, release and instance guards. Results were identical, both dispatch numbers were absent and the native supervisor session remained valid. The synthetic source-test lot was deliberately absent: this proves schema compatibility and stable protected-state observation, not fixture provisioning or concurrency acceptance. Private evidence: concurrency-populated-sql-validation01.json; no OTP or mutation.

Concurrency read-only prerequisites confirmed administrator 871 active/admin, ordinary effective quota hourly 0/5 and daily 6/20, unused FXQ993 receipt number, and Customer A auto_invoice_generation=false. The first private prerequisite script failed on an incorrect auto_invoice column (psql status 3); preserved unchanged. A separate corrected script used the schema-defined auto_invoice_generation column and passed. Private evidence concurrency-auth-prerequisite02.json; no OTP, session change, quota reset or business mutation. Fresh provisioning and race remain pending.

Concurrency receipt preparation source is implemented as an injected ordinary-auth/API workflow: exact fictional FXQ993 three-unit receipt, one authentication and one write, independent authentication/receipt/protected-state checks, and cleanup restricted to the newly created API session after successful reconciliation. Transport uncertainty captures an independent after snapshot and stops without replay or cleanup; reconciliation failure also prevents cleanup. Three focused tests passed, including those stop conditions, and focused lint/whitespace checks passed. The live ownership/TLS/IPC/SQL adapter remains pending; no live OTP or fixture write has occurred.

The preparation-specific reconciliation snapshot now covers exact new receipt/lot/movement/cache rows, protected unrelated business/storage rows, administrator static identity/session hashes, verified OTP counts, effective quotas and the retained native session. Syntax and focused lint passed. Two actual repeatable-read snapshots on the populated primary were identical and confirmed no FXQ993 receipt/lot/movement/cache, native session valid, administrator active/admin and effective quota 0 hourly/6 daily. Private evidence concurrency-preparation-sql-validation01.json; no authentication or write. Live guarded HTTP/IPC adapter and fresh fixture execution remain pending.

Preparation verification now protects unrelated authentication rows, all old administrator sessions and native session continuity, enforces exactly one ordinary OTP/quota increment, and permits cleanup of only the new API session with counters unchanged. Receipt verification follows the existing save_grn response/cache and exact three-unit lot contract. Five focused preparation/auth-cleanup tests passed, with focused lint/syntax; the expanded SQL passed twice on actual populated state (concurrency-preparation-sql-validation02.json). No live authentication or write. Live HTTP/IPC adapter remains pending.

The live fixture preparation adapter is implemented in review source with exact tooling/config/CA/owning-guard hashes, completed older-soak release checks, campaign and ten-minute case deadlines, inherited exclusive actor lock, actual TLS discovery and twelve-hour supervised helper checks, bounded private OTP IPC, in-memory credentials, single write and independent reconciliation before new-session cleanup. Syntax, focused lint and whitespace checks passed. It has not been executed; frozen binding/readiness validation and ordinary fixture provisioning remain pending.

Fresh concurrency fixture preparation executed and passed under frozen tooling 620c16f with immutable ten-minute bindings and the owned actor lock. Exactly one ordinary administrator login and one save_grn created FXQ993, receipt UUID 400db20e-bea4-11f1-903a-6ffba93074e5, lot UUID 400e423c-bea4-11f1-903b-c7dfaaa1d594, quantity/stock 3 and one successful receipt cache. Independent snapshots reconciled exact response/cache/lot, unchanged unrelated business/authentication/storage bytes and retained native session. Normal logout removed only the new API session, preserving historical sessions and actual quota changes. Private evidence concurrency-receipt-preparation0110-01; no replay. This is ordinary API fixture preparation, not native receipt or dispatch concurrency acceptance. Helper transition, coordination and native race remain pending.

Concurrency controls now bind the genuine independently provisioned FXQ993 receipt and lot UUIDs, refusing arbitrary synthetic/old stock. A fresh detached backend helper checkout at f94b8e49e4f94abb1a8f8df3f4a63bf422163c21 and private helpers-primary-concurrency01.json were prepared. The generated core unit specification passed with exact FXQ994/lot matching, five-second bound and RuntimeMaxSec=43200; it has not started. Existing normal09 helper and emulator networking remain unchanged. Native phased driver, coordination, helper transition and race execution remain pending.

The distinct native race driver is implemented in review source with prepare/submit phases under an inherited owned actor lock, API30/installed APK10 hash/audit/normal reverse checks, exact new FXQ993 stock selection and one two-unit item save. The submit phase consumes its marker before the single confirmation tap, captures the existing exact stale-stock Error/OK message (Available 1, Requested 2), and has no retry or autonomous cleanup. Two native selector/refusal tests and Python syntax passed. Driver execution, independent coordinator source/bindings and fresh helper start remain pending; no native race attempt has occurred.

The distinct race coordinator source now gates the API competitor on actual native hold observation, independently reconciles unchanged draft preparation, consumes one attempt for each write, requires native stale-stock UI and bounded transport release evidence, and reconciles stock/cache/protected state before native cleanup or new-session logout. Failures await the independently bounded native actor and preserve a fresh stopped-after snapshot; no replay. Three focused orchestration refusal tests passed (absent hold, uncertain competitor, mutated preparation) and focused lint passed. The live race adapter, supervised helper transition and actual native execution remain pending.

The live race adapter is implemented with source/config/preparation/CA bindings, completed-soak release checks, ten-minute deadline, exclusive inherited actor lock, fictional TLS/IPC ownership, bounded native child phases, safe helper log timing observations and one ordinary administrator competitor. It integrates independent snapshots and a post-reconciliation native cold Orders refresh requiring actual normal-route HTTP complete/200 before new-session logout. Six focused controls/orchestration tests passed, plus lint and Python/JS syntax. Backend timing source 71a7ac8 passed thirteen transport tests. The previously prepared helper source predates timing instrumentation and remains unstarted; a new pinned helper identity, frozen configuration/readiness and actual race execution remain pending.

Fresh timed core helper concurrency02 started successfully from backend 71a7ac8 under exclusive ownership locking, with previous normal09 stopped and preserved. No emulator route or business state changed. Read-only monitor20 failed because its private configuration was not created after a configuration-script KeyError; retained failed unit. Separate monitor21 was configured to cover concurrency02. Frozen race binding generation caught a nonexistent auth_controls.py entry before configuration creation or any native/auth/write attempt; the review tooling list is corrected, requiring a fresh freeze. No native concurrency attempt is consumed by these infrastructure/source validation failures.

Live race attempt 01 stopped before native preparation because its configured owned results directory was absent. One ordinary login, zero native submissions and zero competitor writes; independent stopped reconciliation matched the authenticated baseline with stock 3 and both dispatches absent. The missing directory was created without changing frozen inputs. Fresh attempt 02 reached the native form and stopped at Select GR No because reused grn_search_controls only admits FXF records, while genuine fresh receipt is FXQ993. One ordinary login, zero item saves/submissions/competitor writes; independent stopped reconciliation again matched its authenticated baseline. Both new API sessions, drafts, configs and failures are preserved; no blind cleanup or replay. Actual picker search semantics must be resolved before the remaining corrected run; concurrency remains untested.

The remaining selector correction follows actual application source: the native picker offers first-character prefix F and searches goodsreceived with substring matching, descending GRN number and limit 50. The fresh FXQ993 can therefore be selected by its exact label after F alone, without the old FXF-only digit helper or document-number mutation. The distinct driver now uses that narrow selector and rejects any other receipt. Three Python selector/refusal tests passed. Previous two failures and reconciliations remain preserved; one final corrected run is allowed, with no fourth attempt.

Final allowed concurrency attempt 03 reached exact FXQ993 native review and saved one local two-unit item, but stopped before native confirmation or API competitor because the prepared snapshot differed from the authenticated baseline. Actual markers: native submissions 0, competitor writes 0, ordinary logins 1 for this attempt. Independent stopped observation confirmed stock 3 and neither FXQ994 nor FXQ995 exists; changed keys are authHash and unrelatedAuthHash, so full reconciliation is FAIL and must not be relabelled unchanged. All three failed attempts, new API sessions and current prepared draft are preserved. No fourth native run, retry, session deletion or automatic cleanup is permitted. Controlled concurrency remains BLOCKED/unexecuted at the write stage; authentication change diagnosis remains open.

Read-only authentication diagnosis resolved the attempt03 hash mismatch: the real helper recorded one successful native refresh_jwt_token HTTP 200 at 2026-10-02T21:22:28.602Z. The schema rotates only refresh_sessions.token_hash while retaining session identity/created_at/fixed expiry and inserts consumed-token history. An internal SQL comparison replaced only the native session hash with each consumed historical hash, without returning those values; exactly one candidate recreated the full authenticated baseline authHash. This independently establishes that the observed protected authentication-row difference is the legitimate native token rotation; business/stored bytes remain unchanged and session expiry stays 2026-10-09T18:37:01.054553Z. Private diagnosis dispatch-concurrency0110-03-auth-rotation-diagnosis01.json. Original equality reconciliation FAIL remains historical; this separate diagnosis does not confer concurrency PASS, authorize a fourth attempt or alter tokens/timestamps.

After independent rotation diagnosis, test-delay helper concurrency02 was stopped and preserved. Fresh core normal10 started with default delay disabled and the unchanged twelve-hour cap; monitor22 is read-only and covers it. Actual preflight passed strict owned TLS/IPC identities, certificate horizon, installed APK10/reverse/snapshot, resources, no Metro/ANR/crash and disarmed relay. Authorized cleanup preserved the actual prepared native draft, then cold-launched normal Orders and observed fresh HTTP complete/200 with no OTP or write. A separate independent snapshot matched the diagnosed stopped state exactly, including authentication, unrelated rows and stored bytes; stock 3 and both dispatches absent. Private evidence concurrency-stopped-normal-cleanup01 and concurrency-normal-cleanup01-reconciliation.json. This is cleanup/health evidence only; exhausted concurrency remains BLOCKED with no fourth attempt.

Post-concurrency publication validation: complete documented Node22 mobile setup suite 271/271 PASS; pinned gitleaks 8.30.1 redacted source and all-history scans PASS. Three native selector tests and focused lint/syntax checks remain separate evidence. Installed APK10 is unchanged. These source checks do not clear the dependency gate, exhausted native cases or final-soak gates.

A reusable native-renewal verifier is now implemented for future observers. It requires exact before/after full authentication digest bindings, native session identity and unchanged issue/expiry timestamps, exactly one independently observed refresh HTTP200 within the observation window, exactly one SQL historical-hash match, and unchanged remaining snapshot fields. Two focused tests and lint passed, including refusals for wrong bindings, unexplained/multiple renewal, timestamp changes and business/storage changes. This is source-only verification infrastructure; live proof adapter/integration remain pending. It does not modify historical failures, clear final gates or authorize a fourth concurrency attempt.

The bounded read-only renewal proof adapter is implemented and verified against preserved real attempt03 evidence. It checks the current full authentication digest, exactly one consumed native hash matching the prior digest, exact live supervisor session identity/dates and one actual refresh HTTP200 within the observation window. The reusable verifier passed unchanged protected state; private proof dispatch-concurrency0110-03-bound-renewal-proof02.json explicitly retains historical acceptance BLOCKED and noNativeRun. Four focused source tests and lint passed. Initial private parser01 failed on the bridge plain-text startup line before SQL; retained unchanged, corrected private parser02 filters structured observation lines. No native rerun, OTP, token output, timestamp change, state mutation or historical FAIL replacement. Coordinator integration remains separate pending work.

The renewal proof is integrated into review coordinator preparation: unchanged snapshots pass directly; any difference requires the independent exact-session SQL/HTTP proof and unchanged all other fields. The post-write baseline is the independently reconciled prepared state. Native snapshots now include session identity/issue/expiry metadata; two actual populated snapshots passed and retained stock3/no dispatches/fixed expiry, without native execution. Nine focused integration/refusal tests and lint passed, including that proven renewal cannot bypass the actual hold gate or conceal stock changes. Old frozen runtime/attempts remain untouched, and no fourth native run is authorized or performed.

Renewal-aware complete source validation: Node22 setup suite 277/277 PASS and pinned redacted source/all-history scans PASS. Exact published CI runs remain live and were inspected at their actual steps: mobile37067496315 assembling debug APK since21:34:03Z; backend37067498320 monitoring targets/local delivery since21:42:25Z. No restart/cancellation or debug-to-installed-release evidence transfer. Independent monitor shows healthy owned API30/no ANR/crash/resource pressure; switch/fault lifetimes must be renewed through fresh identities before any stage exceeds remaining caps. Current final-freeze, eight-hour soak and dedicated expiry prerequisites remain unresolved.

## APK10 customer confirmed draft acceptance, 2026-10-02 23:39 UTC

Exact APK SHA256 a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69.
Fresh customer header-draft switch attempt01 reached the destination login in
the same process with old credential keys absent. The original runner remains
FAIL because its observer expected response-complete instead of the installed
pinned helper's complete event. Separate read-only reconciliation passed normal
logout/history removal, unchanged source protected state and stored bytes,
unchanged destination state and no forwarded credentials. Failure is retained.

Continuation frozen at52e949c recomputed reconciliation and bound original
config/native failure/before snapshot/independent proof by hash. One ordinary
destination login passed with one OTP verification and exactly one new fixed
seven-day session. The real customer form was clear in the preserved process
before cold launch. Destination selection persisted and an explicit fresh
authenticated Orders200 completed after cold launch. Existing sessions, unrelated
authentication, business and stored bytes remained unchanged. Independent
postcondition and immutable stage ledger PASS at23:39:01UTC. Private evidence:
confirmed-customer-draft-destination-auth0110-01 and
stage-confirmed-customer-draft-destination-auth0110-01-evidence/ledger.json.

Scope: customer header draft only; GRN, dispatch, invoice and in-flight switching
remain untested. The old primary native session was normally removed; the
original emulator now holds the new switching-warehouse administrator session.
No business submission or replay occurred. All289 source tests passed.

Current backend review CI37074367623 completed PASS at
4cc2c02fe513c3a9b0e9c6c5b42dcd560487ebbb, including isolated installation,
contract, migrations and secret scanning. Remote architecture jobs are CI
evidence only. Mobile CI37078661884 atc48cdc516eba14d76a7e42c94682585a5bd7915e
has a passing secret scan and failing dependency gate; remaining jobs were still
running at this checkpoint. Final freeze/readiness/soak/expiry gates remain open.

APK10 reverse GRN header-draft switch and continuation01 PASS, 2026-10-02UTC.
Frozen tooling1bc59a4 bound the normally authenticated switching administrator
session created by the customer-draft continuation. Actual unsaved receipt
header FXS992 was entered without a receipt submission. One genuine switch
confirmation returned to primary login in the same process, removed old
credential keys and normally removed only that source session/history. Actual
source/destination SQL, stored bytes and safe HTTP evidence reconciled with no
forwarded credentials or unrelated changes. Pre-auth stage and independent
postcondition PASS; no corrected rerun was needed.

One ordinary primary supervisor OTP/login then cleared the GRN header in the
preserved process before cold launch. Primary public selection persisted and
an explicit authenticated Orders200 completed after cold launch. Exactly one
new fixed seven-day primary session/verification was observed; historical
sessions and unrelated authentication/business/stored bytes were preserved.
Immutable stage and independent verification PASS. Private evidence directories:
confirmed-grn-draft-switchback0110-01, confirmed-grn-draft-primary-auth0110-01,
and each corresponding stage-...-evidence/ledger.json. Original emulator now
holds this new primary supervisor session; previous source sessions were
normally logged out. No session reset, business write or fixed OTP occurred.

This covers the GRN header draft plus actual confirmed switch-back. Customer
header draft is separately proven. Dispatch/invoice drafts and in-flight
request/upload/save switching remain open. Existing exhausted baseline cases
remain closed; this independent unsaved-GRN case does not reopen them.
All291 source tests, focused lint and Python syntax passed before freeze.

APK10 confirmed dispatch-notes draft acceptance01 PASS, 2026-10-02UTC.
Frozen1bc59a4 created the actual unsaved notes marker from the normally
authenticated primary supervisor, confirmed genuine switching identity once,
required destination login in the same process and cleared old credential keys.
Source logout/history removal, unchanged protected state/stored bytes and
unchanged destination reconciled before authentication; no old credential was
forwarded. One ordinary destination administrator OTP/login then proved cleared
notes in the preserved process before cold restart, persisted destination
selection and explicit authenticated cold Orders200. Exactly one fixed seven-day
session and one verification were added; old sessions and unrelated auth/business
and objects remained unchanged. Zero dispatch submissions or business replay.
Both immutable stages and independent postconditions PASS. Private evidence:
confirmed-dispatch-draft0110-01, confirmed-dispatch-draft-destination-auth0110-01
and their corresponding stage-...-evidence/ledger.json. The emulator now holds
the new switching administrator session. Customer, GRN and dispatch header
drafts each have independent APK10 evidence; invoice and in-flight request,
upload and save switching remain open. Exhausted positive-dispatch/fault cases
remain closed; this unsaved-notes check does not substitute for them.

APK10 confirmed invoice-header draft switch-back01 PASS, 2026-10-02UTC.
Frozen0551d91 entered the real unsaved invoice-number marker20261992 from the
ordinary switching administrator session, confirmed genuine primary identity
once and preserved the same process through primary login. Old credential keys
and only the source session/history were removed normally. Independent actual
SQL/stored-byte/safe-HTTP observations reconciled unchanged protected source
and destination state with no old credential forwarding. One ordinary primary
supervisor login then proved the invoice header clear before any cold launch,
persisted primary selection and explicit authenticated cold Orders200. Exactly
one new fixed seven-day session and verification were added; prior sessions
and unrelated auth/business/stored objects stayed unchanged. No invoice save
or business submission occurred. Both immutable stages and independent checks
PASS: confirmed-invoice-draft-switchback0110-01 and
confirmed-invoice-draft-primary-auth0110-01, with corresponding
stage-...-evidence/ledger.json. The original emulator holds the new primary
supervisor session. Complete293 source tests and focused lint passed.

Customer, GRN, dispatch and invoice header drafts now each have independent
APK10 confirmed-switch, ordinary-login, same-process-clearing and cold-read
evidence. This does not establish full multi-step draft payload acceptance,
in-flight requests/uploads/saves, positive invoice arithmetic/save/PDF workflows
or the capped baseline cases. Those remain separately open or blocked. Final
readiness, new soak and delayed-expiry appointment remain unstarted.

Independent four-header-draft audit PASS. Private
four-confirmed-header-drafts0110-final-proof.json SHA256
3332ce0beff49affce8b2940cf42dfec4348a5c4ef1af4df9680a06ed9b5ff74
binds each actual source draft, original native result, corrected reconciliation
where applicable, ordinary auth before/after, same-process cleared-form XML,
cold Orders XML and immutable continuation ledger. It checks one confirmation,
zero business writes, one ordinary verification/session per continuation,
unchanged prior sessions and protected state, exact process continuity before
cold restart and exact destination selection. Customer's original FAIL remains
bound and preserved. Scope is four header drafts only.

Confirmed in-flight Orders switching remains NOT TESTED. Existing fixture
Orders transport accepts at most five seconds and its proxy has a fifteen-second
deadline. A longer confirmation-spanning hold requires separately guarded
source changes, real timing evidence and helper replacement/reconciliation;
none was installed or represented as a native pass at this checkpoint.

Confirmed in-flight Orders attempt01 FAIL, preserved. The separate pinned
helper da5c75c was installed as core confirmread12 only after preserving old
normal11 configuration/logs, stopping the owned app without logout and proving
identical two-warehouse snapshots plus actual TLS/private IPC readiness.
Switch observe08 and disarmed fault renew04 remained unchanged; monitor24
covers the new owned units. Native frozenf6dc954 attempt01 stopped at the
explicit Refresh orders phase before confirmation: zero confirmations, business
submissions and OTP requests. Actual helper metadata shows overlapping
automatic successful held Orders reads, including a start before the explicit
request timestamp; the intended single pending read was not established.
The first-stage FAIL is retained. App was subsequently stopped without logout
under its actor lock, and independent stopped reconciliation passed protected
source state, source session identity/fixed dates, destination state and stored
bytes. Private confirmed-orders-read-switch0110-01-stopped-reconciliation.json
records owned-session hash/history comparisons separately. No blind request
replay, OTP, logout or business cleanup occurred. A corrected one-shot armed
read helper is required before using at most two remaining corrected attempts.
Actual in-flight confirmation/destination continuation remain NOT TESTED;
current app is stopped and current core helper still has the bounded hold.

In-flight Orders attempt02 preserves native FAIL but independently reconciles
the actual guarded refusal. Fresh pinned e3126a0 core confirmread13 passed
sequential ownership/TLS/private IPC and identical before/after warehouse
snapshots; monitor25 covers it. Single-use private arm created one safe read
identifier. Actual read started00:25:08.135UTC, confirmation was attempted
00:25:32.102007UTC, and genuine HTTP200 completed00:25:38.136UTC. The app
source/compiled candidate's operation guard refuses activation while a request
is active. Read-only actual screen capture showed Operation In Progress and
Finish the current operation before switching servers. No source logout was
observed, primary public selection remained intact and independent entire
source/destination/auth/storage reconciliation passed exactly unchanged.
No OTP or business submission occurred. The owned app was stopped without
logout after preserving its screen/selection. Core controller is consumed;
subsequent reads are normal and it cannot be rearmed. Failed first ADB public
selection query quoting produced incomplete input before any mutation; the
corrected read-only query used shell quoting and passed.

Private proofs: confirmed-orders-read-switch0110-02-independent-refusal-proof.json
and confirmed-orders-read-switch0110-02-independent-timing-proof.json. These
preserve originalNativeStatus=FAIL and do not claim a completed server switch.
Alert appearance before read settlement was not recorded precisely enough.
Final allowed corrected attempt03 must expect the documented refusal, record
the actual alert during the held read, reconcile unchanged selection/session,
then verify normal-route cold reads. No application behavior needs relaxing to
make the switch occur; earlier successful header-draft switches were idle.

In-flight Orders case is BLOCKED after final attempt03; no fourth native run.
The actual Operation In Progress alert was captured at00:39:18.044916UTC
while the identified read (start00:38:53.799UTC) remained pending until
HTTP200 at00:39:23.803UTC. Zero completed switches, business submissions or
OTP requests. The run then failed at OK because the existing general navigation
selector intentionally acknowledges only Server Unavailable discovery errors.
A separate exact operation-refusal selector is now source-tested; the discovery
guard was not broadened and this does not reopen the exhausted case.299 complete
source tests passed. Actual acknowledgement/cold completion in that native
case remains unproven. All three failures and both earlier independent proofs
are preserved. Private confirmed-orders-read-switch0110-capped-final-proof.json
SHA256 15ca26b5c7f690bbf53a095af7af08090dc0631147c5bd408aebe94ecef38a9a binds these results with noFurtherNativeAttempts=true.

Separately labelled normal cleanup PASS: the owned app was cold-launched
without OTP, logout, confirmation, arming or business replay. Primary public
selection and actual authenticated normal Orders200 passed. Independent before
and after SQL/storage snapshots were exactly equal to the actual case03
baseline, including complete protected authentication and native session state.
The cleanup result remains originalAcceptance=BLOCKED and does not relabel any
failure. Initial private cleanup module-import failure occurred before locks,
native actions or directory creation and is retained; corrected module search
path completed the authorized cleanup. Current core confirmread14 controller
is consumed (all subsequent reads normal); switch observe08/fault renew04 are
unchanged and monitor26 covers current units. App now runs on primary with its
existing supervisor session. No restored archive, timestamps or quotas changed.


Current APK2026100110 supervisor reads PASS on final authorized attempt03.
Frozen tooling28ce721, exact installed APK SHA256
a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69.
Actual native cold Orders200 and Queue200 passed, with visible Create GRN,
Create Dispatch and Create Invoice controls. No business submission or OTP.
Independent before/after navigation SQL snapshots matched exactly, including
profile, business/storage metadata hash, other authentication hash and OTP count;
matched existing native session remained present. This observer does not hash
stored-object bytes and does not establish business write permissions, queue
processing, reciprocal isolation or Realtime. Prior attempt01 FAIL and APK9
attempt02 PASS remain preserved separately; no older result was transferred.
Private supervisor-reads0110-final-proof.json SHA256 8d37f054932aa123802b9f5e2a86fe266f9b65e056d84ff89e7605994b07823b.
Immutable stage-supervisor-read-0110-v3-evidence ledger and checks passed.


APK2026100110 dispatch quantity rejection PASS on final permitted attempt03,
frozen tooling1e9516e. Actual native quantities0 and21 against preserved FXF410
stock20 kept Save dispatch item disabled. Zero item saves, submissions and OTPs.
Independent protected SQL and stored-object byte hashes matched at before,
after and final; normal-route authenticated cold Orders200 passed. FXQ991 stayed
absent and stock20 unchanged. This does not establish valid dispatch writes,
concurrency or lost-response acceptance. Previous attempt01 failure and APK9
attempt02 pass remain separate. Private dispatch-quantity-rejection0110-final-proof.json
SHA256 c904ec79dd7981d53d93528465040cc3809643a7aeeb32223e60f7266f11211e. No further quantity-case native rerun is authorized.


Current-artifact revocation prerequisite audit (2026-10-03 01:10 UTC):
not eligible; no dependency closure or account mutation was performed. The eight
required groups are receipts, orders, dispatch, invoices, documents, Realtime,
switching and isolation. Current APK quantity admission/read/header-switch
proofs are narrower than complete workflow acceptance. Older document, Realtime
and reciprocal isolation results remain historical; the capped read-refusal
proof does not close all switching. No narrow PASS/BLOCKED result is promoted
to an entire group. Private current-artifact-revocation-prerequisite-audit-20261003T0110.json
SHA256 f3fd47c5cb7f371901a68635ef8ec36ca50f576054b7586b38bd44b93305acdf. Final freeze/readiness, soak and expiry appointment remain open.


Revocation evidence guard correction: every group proof and reconciliation now
requires the exact candidate artifact, reserved profile, explicit workflowGroup
and complete-group scope. PASS/FAIL labels and matching file hashes alone no
longer admit older artifacts or narrow read-refusal/quantity proofs as entire
group closure. BLOCKED group proofs also require their own three-attempt/no-more
metadata. Focused refusals and all301 source tests passed; private output is
revocation-exact-group-full-source-tests01.log. No complete-group proof or native
revocation was produced, and existing frozen runtimes remain unchanged.


Delayed-expiry helper lifetime correction in review tooling: appointment
configuration now requires an independently named core-expiry unit, inactive
with Restart=no, NRestarts=0, control-group ownership and a one-hour external
cap. Unit fragment, configuration, certificate and helper source must be bound.
Only normal primary owner/state/guard/socket configuration is admitted;
replacement, read delays and concurrency injection refuse. Under the existing
appointment actor lock, execution requires free owned TLS/IPC endpoints, starts
that unit once, verifies certificate-authenticated actual discovery and IPC
connection readiness, then boots the dedicated AVD. PASS requires both device
and helper clean stop. Existing twelve-hour campaign helpers are not extended
or replaced. New helper state refusals2/2, complete source suite301/301 and final
expiry integration tests12/12 passed. This is source evidence only: no dedicated
unit, AVD/session or timer was created; actual appointment integration remains
unverified and scheduling is still prohibited until final freeze gates pass.


Dedicated-expiry helper integration follow-up: source inspection showed the
real supervisor starts emulator-fixture-bridge.mjs directly, not a supervisor
command carrying the configuration argument. The guard now checks exact
configuration-derived unit name/bridge path, working directory, owned
environment and no drop-in overrides. Wrong state, replacement environment
and changed ownership refuse (2 Python tests PASS). The new readiness function
also passed an actual read-only certificate-verified primary discovery200/UUID
and IPC connection on existing confirmread14, with no OTP or service start.
Private expiry-helper-real-readiness-probe01.json records this narrow result;
it is not dedicated-unit or naturally expired session acceptance. Final
appointment creation remains gated and unperformed.


APK2026100110 supervisor foreground Realtime PASS, frozen tooling0efdaf5.
Three ordinary API logins (A/supervisor/admin) were reconciled, followed by
two fresh exact note updates0110A/0110B. Prior full cart rows/notes are preserved
in the original snapshot; markers0109 were not replayed. Live supervisor/admin
subscriptions received both events, A only its own event, with bounded live
negative controls. Actual native supervisor refetched Orders200 after the event
without manual Refresh. Protected SQL/stored bytes and old authentication
reconciled; only the three newly issued API sessions were normally logged out.
Original native supervisor session remains present. Private supervisor-realtime0110-final-proof.json
SHA256 e2bdaf51267575027e0536a4df718b32986611fa6a7120b30263a91ffcadf96e. This does not establish reconnect/resubscription, reciprocal
native B, literal staff, cart/queue processing or complete Realtime-group closure.


APK2026100110 supervisor Realtime disconnect/reconnect PASS on final
bounded attempt03, frozen toolinge1d427c. Two stable Android observations
established no default network; exact fixture-UID TLS loopback rejection and
removed reverse route established device disconnection. Owned rule, airplane,
radios and reverse were restored to recorded values before a fresh B event.
Native supervisor then refetched Orders200 without manual Refresh. Live wire
controls preserved A-only versus supervisor/admin-both delivery. Both fresh
0110RA/RB note updates reconciled against SQL/stored bytes. Three ordinary
API logins were normally logged out only after acceptance; old authentication
and the existing native supervisor session remained preserved. Original cart
rows/notes remain in private snapshots, with no replay of0110A/B or0109 markers.
Private supervisor-realtime-reconnect0110-final-proof.json SHA256 8c36869546b8741ac2ce5100394e7be8ebd087310a657279f05985127a0ee8df.
This is emulator reconnect evidence, not physical network, reciprocal native B,
literal staff or complete business/isolation acceptance.


Fresh normal-dispatch stock preparation on APK10 fixtures PASS: FXF960 has
one10-unit lot, created through one ordinary administrator OTP/login and one
API save_grn with independent before/auth/write/logout SQL and stored-byte
reconciliation. Only its new API session was removed. This is API fixture
preparation, not native receipt acceptance; prior fixtures/transactions remain.

Native partial FXF961 attempted exactly one3-unit submission and displayed
Dispatch Created Successfully, then its post-submit observer refused
UNRELATED_BUSINESS_CHANGED. Original native/immutable ledger remain FAIL.
Independent SQL found one header, one line, one matching cached success and
stock10→7. Exact source-row comparison against preserved preparation found
only receipt updated_at/updated_by and lot stock changed. The intended updater
is the actual native supervisor, differing from the administrator fixture
creator; the old observer allowed updated_at but omitted this actor change.
Hash-bound reconstruction changed only that source updated_by to its recorded
original for comparison, recomputed all original auth/cache/unrelated-state
checks and passed. Live stored-object hashes were unchanged. No operation was
replayed or document erased. Private normal-partial-dispatch0110-independent-final-proof01.json
SHA2565405bba39ca83e50d43526cac4064bbd869a31244ebe37f23ab2ab538b3bb44d.
This is separate exact-once reconciliation, not a relabelled native PASS.

Review tooling now excludes only the bound source updater from the unrelated
hash and separately requires it to equal the native supervisor after submit.
Older administrator/fault/concurrency guards are unchanged. Complete source
validation310/310 passed. Final FXF962 remains unsubmitted and requires a new
immutable stage after this correction; it is not an FXF961 retry.
