# Complete-schema observer SQL check

Preparation657 executes the actual dispatch and navigation snapshot queries in
a new isolated PostgreSQL container after all18 unmodified backend migrations.
It checks SQL names/types/JSON shape against the complete schema, missing-source
and missing-session rejection, and stable repeated read digests. It does not issue
a session, call business RPCs, exercise RLS or the guarded observer CLI's warehouse
ownership path, test populated fixtures, or establish native acceptance.

Use tooling commit `8f31e1a3440d1422691d769cd01a04ec5bbdb980` or a recorded descendant
from the mobile review branch in a separate tooling checkout. Application build
pin2fb remains unchanged; this optional checker did not exist at that earlier pin.
Use a clean backend checkout of `bed4eeee4a008073aa453c32da27cade50a32a2f`.
Never point this script at a warehouse database or attach its state/volumes.

Run only if the queries/schema changed or compatibility remains unresolved.
Existing657PASS does not require an identical rerun. Use Node22.23.3/npm10.9.9 and
effective Docker access. Choose an unused numeric suffix and new private evidence
directory outside Git. Commands below assume Docker group access.

```bash
umask 077
SQL_NAME=warehouse-schema-observer-657
SQL_IMAGE=supabase/postgres@sha256:0e2279598bc0224fb5960c3a61eb23270cd60119427f3a7bdec86ba282600dcc
SCHEMA_EVIDENCE="$HOME/warehouse-observer-schema-657-private"
BACKEND_SCHEMA_SOURCE="$HOME/warehouse-backend-guide-check-2026100102"
test ! -e "$SCHEMA_EVIDENCE"
mkdir -m 700 "$SCHEMA_EVIDENCE"
# Stop if this exact container name exists.
docker ps -a --format '{{.Names}}'
docker image inspect "$SQL_IMAGE" > "$SCHEMA_EVIDENCE/image.json"
# New scratch-only secrets, generated locally, never copied from a warehouse.
export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
export JWT_SECRET="$(openssl rand -hex 48)"
docker run -d --name "$SQL_NAME" \
  --label "warehouse.exercise=${SQL_NAME#warehouse-}" \
  --network none --memory 1g --cpus 1 --pids-limit 256 --restart no \
  --tmpfs /var/lib/postgresql/data:rw,size=768m \
  -e POSTGRES_PASSWORD -e JWT_SECRET -e JWT_EXP=3600 \
  -e AUTH_MODE=operator -e APP_ENV=production "$SQL_IMAGE"
unset POSTGRES_PASSWORD JWT_SECRET
docker exec "$SQL_NAME" pg_isready -U postgres -h 127.0.0.1
# Require readiness; bounded repeat of this read-only probe, <=60seconds.
node scripts/check-observer-schema.mjs "$SQL_NAME" "$BACKEND_SCHEMA_SOURCE" \
  "$SCHEMA_EVIDENCE" > "$SCHEMA_EVIDENCE/result.log" 2>&1
```

The checker verifies name/label/image/network isolation, no host ports/external
mounts/privilege/restart, oneCPU/1GiB limits and tmpfs data. It refuses dirty or
different backend source, an existing migration ledger or warehouse schema.
Private evidence is reserved before each command; reusing its directory cannot
execute that command again. Raw output and Docker inspection can include generated
scratch credentials: keep all evidence0700/files0600 outside Git.

Both dispatch query variants (with/without an operation key) must produce the
expected empty result and reject missing reserved stock. Repeated navigation
queries must be equal, with no matching profile/session, zero OTP rows and valid
business/auth digests; the native precondition must reject the missing session.
No native booleans or fake session are substituted to obtain a PASS.

Preserve any failure. A second invocation against the same database with a new
empty evidence directory must refuse the nonempty schema before migrations or
observer queries. This is an explicit negative test, not a failed installation.
After saving results and verifying the exact name/label/image, remove only this
scratch container:

```bash
docker inspect "$SQL_NAME" > "$SCHEMA_EVIDENCE/container.json"
docker inspect "$SQL_NAME" --format '{{index .Config.Labels "warehouse.exercise"}}'
# Require exactly schema-observer-657 (or your chosen suffix) and the pinned image.
docker stop --time 10 "$SQL_NAME"
docker rm "$SQL_NAME"
```

Evidence657: complete18-migration compatibility PASS; five query/rejection checks
PASS; reused-schema refusal PASS; owned container removed. Initial setup76PASS,
then an early foreign-name regression brought setup to77PASS. No warehouse,
emulator, route, session or frozen source changed. Populated-fixture/native/cleanup
integration remains open. Exact executed script hash/raw output are private.
The final helper adds early name refusal before Docker inspection; its regression
passed without repeating the unchanged SQL workload.
