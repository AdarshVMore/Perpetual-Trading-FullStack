#!/usr/bin/env bash
#
# End-to-end happy-path smoke test for the perps stack.
#
# Exercises: admin create-market -> two user signups -> add balance ->
# maker LIMIT short -> taker MARKET long -> position + fill assertions.
#
# Requires the full stack running (bun run dev) plus `curl` and `jq`.
# Usage: bash scripts/e2e-test.sh

set -u

API="${API:-http://localhost:3000}"
MARKET="${MARKET:-BTCUSDT}"
PRICE="${PRICE:-50000}"
QTY="${QTY:-2}"
LEVERAGE="${LEVERAGE:-10}"

PASS=0
FAIL=0

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }

pass() { PASS=$((PASS + 1)); green "  PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); red   "  FAIL: $1"; }

# check <description> <actual> <expected>
check() {
  if [ "$2" = "$3" ]; then
    pass "$1 (got $2)"
  else
    fail "$1 (expected $3, got $2)"
  fi
}

require() {
  command -v "$1" >/dev/null 2>&1 || { red "Missing dependency: $1"; exit 1; }
}

require curl
require jq

# Fail fast if the API is not actually the backend (e.g. port shadowed).
echo "==> Checking API reachability at $API"
PING_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/v1/auth/signin" \
  -H "Content-Type: application/json" -d '{"email":"x@x.com","password":"x"}')
if [ "$PING_STATUS" = "000" ]; then
  red "Cannot reach $API. Is the backend running?"
  exit 1
fi
if [ "$PING_STATUS" = "405" ] || [ "$PING_STATUS" = "404" ]; then
  red "Got HTTP $PING_STATUS from $API/api/v1/auth/signin."
  red "The frontend dev server is probably shadowing the backend on this port."
  exit 1
fi
green "API reachable (signin probe returned $PING_STATUS)"

ts=$(date +%s)

echo
echo "==> 1. Admin signup + create market"
ADMIN_TOKEN=$(curl -s -X POST "$API/api/v1/auth/signup" -H "Content-Type: application/json" \
  -d '{"email":"admin-'"$ts"'@e2e.com","password":"test123","role":"admin"}' | jq -r .token)
[ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ] && pass "admin token issued" || fail "admin token missing"

MK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/v1/order/create-market" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"marketId":"'"$MARKET"'","marketName":"E2E '"$MARKET"'","symbol":"'"$MARKET"'","maxLeverage":100}')
check "create-market returns 200" "$MK_STATUS" "200"

echo
echo "==> 2. Reject create-market without admin token (expect 401)"
NOADMIN=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/v1/order/create-market" \
  -H "Content-Type: application/json" -d '{"marketId":"X","marketName":"X","maxLeverage":10}')
check "create-market unauthenticated" "$NOADMIN" "401"

echo
echo "==> 3. User signups"
MAKER_RES=$(curl -s -X POST "$API/api/v1/auth/signup" -H "Content-Type: application/json" \
  -d '{"email":"maker-'"$ts"'@e2e.com","password":"test123","role":"user"}')
MAKER_TOKEN=$(echo "$MAKER_RES" | jq -r .token)
MAKER_ID=$(echo "$MAKER_RES" | jq -r .userId)
[ -n "$MAKER_TOKEN" ] && [ "$MAKER_TOKEN" != "null" ] && pass "maker token issued" || fail "maker token missing"

TAKER_RES=$(curl -s -X POST "$API/api/v1/auth/signup" -H "Content-Type: application/json" \
  -d '{"email":"taker-'"$ts"'@e2e.com","password":"test123","role":"user"}')
TAKER_TOKEN=$(echo "$TAKER_RES" | jq -r .token)
TAKER_ID=$(echo "$TAKER_RES" | jq -r .userId)
[ -n "$TAKER_TOKEN" ] && [ "$TAKER_TOKEN" != "null" ] && pass "taker token issued" || fail "taker token missing"

echo
echo "==> 4. Balance read + add"
BAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/v1/auth/balance" \
  -H "Authorization: Bearer $TAKER_TOKEN")
check "get balance returns 200" "$BAL_STATUS" "200"

ADD_AVAIL=$(curl -s -X POST "$API/api/v1/auth/add-balance" \
  -H "Authorization: Bearer $TAKER_TOKEN" -H "Content-Type: application/json" \
  -d '{"amount":5000}' | jq -r .availableBalance)
[ -n "$ADD_AVAIL" ] && [ "$ADD_AVAIL" != "null" ] && pass "add-balance returned availableBalance ($ADD_AVAIL)" || fail "add-balance failed"

echo
echo "==> 5. Auth guard on create-order (expect 401)"
NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/v1/order/create-order" \
  -H "Content-Type: application/json" \
  -d '{"marketId":"'"$MARKET"'","price":'"$PRICE"',"qty":1,"leverage":10,"orderType":"LIMIT","positionType":"LONG"}')
check "create-order unauthenticated" "$NOAUTH" "401"

echo
echo "==> 6. Maker posts LIMIT SHORT @ $PRICE x$QTY"
MAKER_ORDER=$(curl -s -X POST "$API/api/v1/order/create-order" \
  -H "Authorization: Bearer $MAKER_TOKEN" -H "Content-Type: application/json" \
  -d '{"marketId":"'"$MARKET"'","price":'"$PRICE"',"qty":'"$QTY"',"leverage":'"$LEVERAGE"',"orderType":"LIMIT","positionType":"SHORT"}')
MAKER_ORDER_ID=$(echo "$MAKER_ORDER" | jq -r .orderId)
[ -n "$MAKER_ORDER_ID" ] && [ "$MAKER_ORDER_ID" != "null" ] && pass "maker order accepted ($MAKER_ORDER_ID)" || fail "maker order rejected"

sleep 1

echo
echo "==> 7. Taker crosses with MARKET LONG x$QTY"
TAKER_ORDER=$(curl -s -X POST "$API/api/v1/order/create-order" \
  -H "Authorization: Bearer $TAKER_TOKEN" -H "Content-Type: application/json" \
  -d '{"marketId":"'"$MARKET"'","price":0,"qty":'"$QTY"',"leverage":'"$LEVERAGE"',"orderType":"MARKET","positionType":"LONG"}')
TAKER_ORDER_ID=$(echo "$TAKER_ORDER" | jq -r .orderId)
[ -n "$TAKER_ORDER_ID" ] && [ "$TAKER_ORDER_ID" != "null" ] && pass "taker order accepted ($TAKER_ORDER_ID)" || fail "taker order rejected"

echo
echo "==> 8. Wait for db-poller to persist position + fills"
TAKER_POS_QTY="null"
for _ in 1 2 3 4 5 6 7 8; do
  sleep 1
  TAKER_POS=$(curl -s "$API/api/v1/order/get-positions/$MARKET" -H "Authorization: Bearer $TAKER_TOKEN")
  TAKER_POS_QTY=$(echo "$TAKER_POS" | jq -r '.positions[0].qty // "null"')
  [ "$TAKER_POS_QTY" != "null" ] && break
done

if [ "$TAKER_POS_QTY" != "null" ]; then
  TAKER_POS_SIDE=$(echo "$TAKER_POS" | jq -r '.positions[0].positionType // "null"')
  check "taker position qty" "$TAKER_POS_QTY" "$QTY"
  check "taker position side" "$TAKER_POS_SIDE" "LONG"
else
  fail "taker position never appeared in DB"
fi

FILLS=$(curl -s "$API/api/v1/order/get-fills/$MARKET" -H "Authorization: Bearer $TAKER_TOKEN")
FILL_COUNT=$(echo "$FILLS" | jq -r '.fills | length')
if [ "$FILL_COUNT" -ge 1 ] 2>/dev/null; then
  pass "fills persisted ($FILL_COUNT)"
else
  fail "no fills persisted"
fi

echo
echo "==> 9. Orders persisted for taker"
ORDERS=$(curl -s "$API/api/v1/order/get-orders/$MARKET" -H "Authorization: Bearer $TAKER_TOKEN")
ORDER_COUNT=$(echo "$ORDERS" | jq -r '.orders | length')
if [ "$ORDER_COUNT" -ge 1 ] 2>/dev/null; then
  pass "taker orders persisted ($ORDER_COUNT)"
else
  fail "no taker orders persisted"
fi

echo
echo "=================================================="
green "PASS: $PASS"
if [ "$FAIL" -gt 0 ]; then
  red "FAIL: $FAIL"
  exit 1
fi
green "FAIL: $FAIL"
green "All checks passed."
