#!/usr/bin/env bash
# Cost-optimised entrypoint for the combined API machine.
#
# Runs the public REST API together with the three background services
# (engine, db-poller, binance-ws) in a SINGLE Fly machine. Because they live
# on the machine that serves HTTP, Fly can auto-suspend the whole thing when
# the demo is idle and auto-start it on the next request -> ~$0 when unused.
#
# `wait -n` (bash builtin) returns as soon as ANY child exits; we then kill the
# rest and exit non-zero so Fly restarts the machine cleanly.
set -eu

# Apply any pending Prisma migrations before starting (idempotent no-op when
# already up to date). Needed on hosts without a separate release phase
# (e.g. Render free). Never blocks startup if the DB is briefly unreachable.
echo "[start-all] running prisma migrate deploy"
(cd packages/prisma-db && bunx prisma migrate deploy) \
  || echo "[start-all] WARNING: prisma migrate deploy failed; continuing anyway"

echo "[start-all] launching backend + engine + db-poller + binance-ws"

bun apps/backend/src/index.ts &
API_PID=$!

bun apps/engine/src/index.ts &
ENGINE_PID=$!

bun apps/db-poller/src/index.ts &
POLLER_PID=$!

bun apps/binance-ws/src/index.ts &
BINANCE_PID=$!

wait -n
EXIT_CODE=$?

echo "[start-all] a child exited (code ${EXIT_CODE}); shutting the rest down"
kill "$API_PID" "$ENGINE_PID" "$POLLER_PID" "$BINANCE_PID" 2>/dev/null || true

exit "${EXIT_CODE}"
