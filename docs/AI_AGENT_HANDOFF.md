# AI agent handoff: warehouse demo after paired customer-history merge

Updated 2026-09-21 for continuation on another computer. Do not use GLM skills.

## Current status

The paired customer-history repair is reviewed, merged, green in default-branch
CI, and smoke-tested on an Android API-36 emulator. Do not recreate its PRs or
repeat it as open work.

| Repository | Merged implementation commit | Pull request | Main CI |
| --- | --- | --- | --- |
| `abhiguru/rn-warehouse-template` | `09919ebfbce1f6e819363eca7711c23dd29b155f` | [#15](https://github.com/abhiguru/rn-warehouse-template/pull/15) | [35605871279](https://github.com/abhiguru/rn-warehouse-template/actions/runs/35605871279) |
| `abhiguru/supabase-warehouse-template` | `a1ad80741ddff97d4f9eb47a0066094f76ea476a` | [#11](https://github.com/abhiguru/supabase-warehouse-template/pull/11) | [35606744913](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35606744913) |

Both backend workflow copies are byte-identical and intentionally pin mobile
implementation commit `09919ebfbce1f6e819363eca7711c23dd29b155f`. A later
mobile documentation-only commit does not require changing that pin.

The backend run verified 94 RPC names / 129 typed calls with zero missing names
and zero mismatches. A fresh Android Debug build on `Medium_Phone_API_36.1`
(API 36) completed and installed. Fictional customer OTP login succeeded; the
assigned customer displayed two GRNs and three recent dispatches. Force-stop and
launcher restart restored the authenticated Orders screen. See
`docs/NATIVE_ACCEPTANCE.md` and `docs/HANDOFF_REVIEW_2026-09-21.md` for the
durable scope and evidence.

The immutable `v0.2.2-demo` tags remain mobile
`6e6885786912fe9186285103e19de762e4ba88f8` and backend
`2959881d0e46a8797a98d10da8c7139217477476`. The customer-history repair is
post-release work and does not move or amend those tags.

## Checkout on another computer

Clone current `main` branches as siblings and record the actual HEADs:

```bash
mkdir -p ~/ws/warehouse-demo
cd ~/ws/warehouse-demo
git clone https://github.com/abhiguru/rn-warehouse-template.git
git clone https://github.com/abhiguru/supabase-warehouse-template.git
git -C rn-warehouse-template rev-parse HEAD
git -C supabase-warehouse-template rev-parse HEAD
```

Read applicable `AGENTS.md` instructions, then read:

1. Mobile `docs/HANDOFF_REVIEW_2026-09-21.md` for current priorities.
2. Mobile `docs/NATIVE_ACCEPTANCE.md` for Android and qualified iOS evidence.
3. Both `docs/DEVELOPER_HANDOFF.md` files.
4. Backend `docs/CLEAN_INSTALL.md` before starting checkout-owned services.

Use Node.js 22.18 or newer. Android emulator work requires the Android SDK, a
compatible JDK, and explicit ownership of the AVD and reverse mappings. Physical
iOS work requires a Mac with full Xcode and a connected iPhone; iOS has no
equivalent to `adb reverse`.

## Remaining work, in order

1. Make physical-iPhone onboarding reproducible from tracked instructions. The
   successful run required temporary USB-only API and Metro relays plus local
   development signing. Supply a reviewed helper or procedure with reconnect
   detection, origin handling, and ownership-scoped shutdown. Keep demo OTP
   services off LAN and public listeners.
2. Fix revoked-session UX. Protected data is denied correctly, but an active
   account revoked server-side leaves the stock screen failed instead of clearing
   credentials and returning to login. Route only definitive session revocation
   through shared logout/cache invalidation. Assignment denial and network errors
   must preserve a valid session. Verify cold relaunch remains logged out.
3. Replace timestamped `Review customer <timestamp>` fixture names with readable
   fictional names or isolate automated test data. Preserve real customer names.
4. Retrieve the original definition for ordered item 4 before starting it; that
   definition is not contained in this handoff.
5. Treat enabled telemetry, production signing/distribution, SMS/TLS/operations,
   retention/privacy declarations, printing, sensors, Realtime, payments, and
   unsupported integrations as separate production gates.

Do not broaden grants, weaken RLS, expose Metro or demo OTP services publicly,
reuse another checkout's generated secrets, attach native binaries to the source
demo release, or move existing tags while completing these items.
