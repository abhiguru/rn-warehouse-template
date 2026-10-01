# VM-only acceptance campaign, 1 October 2026

This campaign remains in progress. It uses the existing x86_64 VM and the owned API30 emulator only. Its 48-hour deadline is 3 October 2026 at 16:27:13 UTC. There is no ARM build, physical-device acceptance, production contact, real SMS, restore, release or merge.

The completed eight-hour soak belongs exclusively to the older APK, build 2026100101. Its immutable plan, 54 bound inputs and PASS ledger remain preserved. None of its acceptance transfers to a later APK. The final new-artifact soak has **not started**; unresolved native writes and missing acceptance cases still block its gates.

## Source and artifact checkpoint

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

## Executed results

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
