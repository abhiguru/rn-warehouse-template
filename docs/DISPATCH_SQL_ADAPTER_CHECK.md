# SQL-only dispatch adapter regression

This optional development check validates the generated snapshot query and pure
reconciliation predicates against a **new scratch PostgreSQL database**. It is not
a warehouse installation, an RPC/RLS test, or Android evidence. It never invokes
or weakens the core fixture's original ownership guard. No production/test warehouse
state, credential, volume, route or connector is used.

Use the documented Docker access and Node22 toolchain. Choose an unused numeric
suffix and a private0700 evidence directory outside Git. Do not attach a volume,
publish ports or substitute an existing warehouse container. This uses a cached
pinned base image; if unavailable, obtain that exact image separately first.

```sh
SQL_NAME=warehouse-sql-adapter-647
SQL_IMAGE=supabase/postgres@sha256:0e2279598bc0224fb5960c3a61eb23270cd60119427f3a7bdec86ba282600dcc

docker run -d --name "$SQL_NAME" \
  --label "warehouse.exercise=${SQL_NAME#warehouse-}" \
  --network none --read-only \
  --tmpfs /tmp:rw,nosuid,size=256m,mode=1777 \
  --memory 512m --cpus 1 --pids-limit 128 --user postgres \
  --entrypoint /bin/sh "$SQL_IMAGE" -c \
  'initdb -D /tmp/pgdata --auth-local=trust --auth-host=reject >/tmp/init.log 2>&1 && exec postgres -D /tmp/pgdata -k /tmp -c "listen_addresses=" -c shared_buffers=32MB'

docker exec "$SQL_NAME" pg_isready -h /tmp -U postgres
# Continue only when ready; use a bounded wait, at most30seconds.
node scripts/check-dispatch-snapshot-sql.mjs "$SQL_NAME"
```

Keep stdout/stderr in protected evidence rather than Git. PostgreSQL accepts only
its new container-local Unix socket; TCP listeners and container networking are
disabled. Local trust here is solely for this scratch query test, not a warehouse
login mechanism or OTP/authentication bypass. No credential from an instance is
reused. Initialization produces fresh tmpfs state, not a restored/cloned database.

The script refuses other names, missing/mismatched labels, another image/user,
network access, writable root filesystems, published ports, external mounts and
nonempty public schemas. It creates a minimal schema with fictional UUIDs/records
and exercises baseline, before-loss and both retry predicates. It rejects occupied
records, duplicate stock effects, duplicate cache entries, unrelated business
changes and a wrong stock line. Its native booleans are synthetic predicate
inputs; a PASS must never be recorded as native UI acceptance.

This catches SQL syntax/aggregate/JSON-shape errors but does not replace a test on
the complete migrated schema with real RPCs, triggers, policies, sessions or the
released fixture. In particular, it does not exercise the guarded observation
CLI's Docker-password handling or its actual warehouse ownership integration.

Preserve the result, isolation settings, exact script/source SHA and any failure.
An immediate rerun is expected to refuse the nonempty schema. After verifying the
label still matches this scratch attempt, stop and remove **only this container**:

```sh
docker inspect "$SQL_NAME" --format '{{index .Config.Labels "warehouse.exercise"}}'
# Require exactly the suffix above before cleanup.
docker stop --time 10 "$SQL_NAME"
docker rm "$SQL_NAME"
```

Do not prune Docker or delete another state to repeat the test. Use a new container
and new evidence directory for another attempt. This check is explicit, not part
of `npm run test:setup`, so ordinary source tests need no Docker mutation access.

Evidence647 (2026-10-01): query/predicate checks PASS and reused-state refusal PASS
in the pinned PostgreSQL15.8 image, networknone/noports/tmpfs,1CPU/512MiB cap.
Container removed after isolation/evidence capture. The initial result's numeric
case count was8; the script now names the nine checks to remove that reporting
ambiguity. No additional test execution is implied by that reporting correction.
The running warehouse/fixture and54frozen soak bindings were unchanged.
