# Manual Testing Toolkit

Copy-paste `curl`, `websocat`, and `redis-cli` commands to exercise the whole
perps stack by hand. Every REST call lists its method, URL, headers, JSON body,
and the expected response.

## 0. Prerequisites

- Postgres running on `localhost:5432` and Redis on `localhost:6379`.
- Prisma schema applied (`bunx prisma migrate deploy` / `db push` in
  `packages/prisma-db`).
- Stack running: `bun run dev` (turbo starts backend, engine, ws, db-poller,
  binance-ws, frontend). The backend API is on **`:3000`**, the WS server on
  **`:8080`**, and the frontend UI now serves on **`:5173`**.
- Optional helpers: `jq` (pretty JSON), `websocat` (WS client), `redis-cli`.

Endpoint map:

| What            | URL                          |
| --------------- | ---------------------------- |
| REST API        | `http://localhost:3000`      |
| WebSocket feed  | `ws://localhost:8080`        |
| Redis           | `redis://localhost:6379`     |

Markets that exist in engine memory at boot: `BTCUSDT`, `ETHUSDT`, `SOLUSDT`.
New signups start with `availableBalance = 1,000,000`.

Shell variables used below:

```bash
export API=http://localhost:3000
export MARKET=BTCUSDT
```

---

## 1. Signup / Signin (JWT)

Body schema: `{ "email": <email>, "password": <string>, "role": "user" | "admin" }`.
The signin body omits `role`.

Sign up a normal user and capture the token:

```bash
curl -s -X POST "$API/api/v1/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"test123","role":"user"}' | jq
```

Expected (`200`):

```json
{ "message": "user signed up successfully!", "token": "<jwt>", "userId": "<cuid>" }
```

Store it for later calls:

```bash
export USER_TOKEN=$(curl -s -X POST "$API/api/v1/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice2@example.com","password":"test123","role":"user"}' | jq -r .token)
echo "$USER_TOKEN"
```

Sign up an admin (needed for create-market). Admin tokens are signed with a
different secret and only work on admin routes:

```bash
export ADMIN_TOKEN=$(curl -s -X POST "$API/api/v1/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"test123","role":"admin"}' | jq -r .token)
echo "$ADMIN_TOKEN"
```

Sign in (existing user):

```bash
curl -s -X POST "$API/api/v1/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"test123"}' | jq
```

Negative cases:

```bash
# Wrong/unknown user -> 401 {"message":"user does not exists"}
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/api/v1/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com","password":"x"}'

# Invalid email -> 400 with zod error
curl -s -X POST "$API/api/v1/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"x","role":"user"}' | jq
```

---

## 2. Balance (get / add)

`GET /balance` and `POST /add-balance` require `Authorization: Bearer <token>`.
Add-balance body: `{ "amount": <positive number> }`.

```bash
# Current balance
curl -s "$API/api/v1/auth/balance" -H "Authorization: Bearer $USER_TOKEN" | jq

# Add 5000
curl -s -X POST "$API/api/v1/auth/add-balance" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":5000}' | jq
```

Expected: `{ "availableBalance": <num>, "lockedBalance": <num> }`. `add-balance`
also writes an `add-balance` message to the `send-to-engine` stream so the engine
keeps its in-memory collateral in sync.

Auth check (no token -> `401`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/v1/auth/balance"
```

---

## 3. Create market (admin only)

Body: `{ "marketId", "marketName", "symbol"?, "maxLeverage" (<=100) }`.

```bash
curl -s -X POST "$API/api/v1/order/create-market" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"marketId":"DOGEUSDT","marketName":"Doge Perp","symbol":"DOGEUSDT","maxLeverage":50}' | jq
```

Expected `200`: `{ "message": "recieved <stream-id>" }`. The engine adds the
market to its order book and the db-poller upserts it into the `Markets` table.

Negative cases:

```bash
# No admin token -> 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/api/v1/order/create-market" \
  -H "Content-Type: application/json" \
  -d '{"marketId":"X","marketName":"X","maxLeverage":10}'

# Admin token but invalid body -> 400
curl -s -X POST "$API/api/v1/order/create-market" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"marketId":"X"}' | jq
```

List markets (public):

```bash
curl -s "$API/api/v1/order/get-markets" | jq
```

---

## 4. Create order

Body: `{ "marketId", "price", "qty" (>0), "leverage" (1-100), "orderType":
"LIMIT"|"MARKET", "positionType": "LONG"|"SHORT" }`. For a `MARKET` order send
`"price": 0`. Requires a user token.

Limit LONG:

```bash
curl -s -X POST "$API/api/v1/order/create-order" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"marketId":"'"$MARKET"'","price":50000,"qty":1,"leverage":10,"orderType":"LIMIT","positionType":"LONG"}' | jq
```

Limit SHORT (acts as a resting ask / maker):

```bash
curl -s -X POST "$API/api/v1/order/create-order" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"marketId":"'"$MARKET"'","price":50000,"qty":1,"leverage":10,"orderType":"LIMIT","positionType":"SHORT"}' | jq
```

Market LONG (taker, set price 0):

```bash
curl -s -X POST "$API/api/v1/order/create-order" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"marketId":"'"$MARKET"'","price":0,"qty":1,"leverage":10,"orderType":"MARKET","positionType":"LONG"}' | jq
```

Expected `200`: `{ "message": "order Accepted", "orderId": "<uuid>", "queueId":
"<stream-id>" }`. Capture the id:

```bash
export ORDER_ID=$(curl -s -X POST "$API/api/v1/order/create-order" \
  -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
  -d '{"marketId":"'"$MARKET"'","price":10000,"qty":1,"leverage":10,"orderType":"LIMIT","positionType":"LONG"}' | jq -r .orderId)
echo "$ORDER_ID"
```

Validation (missing fields -> `400`):

```bash
curl -s -X POST "$API/api/v1/order/create-order" \
  -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
  -d '{"marketId":"'"$MARKET"'"}' | jq
```

---

## 5. Read order / position / fill state

All require a user token and a path `marketId`/`orderId`.

```bash
# Orders for this user in a market
curl -s "$API/api/v1/order/get-orders/$MARKET" -H "Authorization: Bearer $USER_TOKEN" | jq

# A single order by id (must belong to the user)
curl -s "$API/api/v1/order/get-order/$ORDER_ID" -H "Authorization: Bearer $USER_TOKEN" | jq

# Open positions in a market
curl -s "$API/api/v1/order/get-positions/$MARKET" -H "Authorization: Bearer $USER_TOKEN" | jq

# Fills in a market
curl -s "$API/api/v1/order/get-fills/$MARKET" -H "Authorization: Bearer $USER_TOKEN" | jq
```

These read from Postgres (written by the db-poller), so allow ~0.5-1s after a
trade for rows to appear.

---

## 6. Cancel order

`POST /cancle-order/:orderId` with body `{ "marketId", "price", "positionType",
"qty"?, "leverage"?, "orderType"? }`.

```bash
curl -s -X POST "$API/api/v1/order/cancle-order/$ORDER_ID" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"marketId":"'"$MARKET"'","price":10000,"positionType":"LONG"}' | jq
```

Expected `200`: `{ "message": "request accepted to cancle the order" }`. The
engine removes it from the book, unlocks the reserved margin, and the db-poller
marks it `CANCLED`.

Missing required fields -> `400`:

```bash
curl -s -X POST "$API/api/v1/order/cancle-order/some-id" \
  -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
  -d '{}' | jq
```

---

## 7. End-to-end match (maker + taker -> position + fill)

Two users: a maker rests a LIMIT order, the taker crosses it with a MARKET order.

```bash
# Maker = SHORT limit at 50000
export MAKER=$(curl -s -X POST "$API/api/v1/auth/signup" -H "Content-Type: application/json" \
  -d '{"email":"maker-'$RANDOM'@example.com","password":"test123","role":"user"}' | jq -r .token)
curl -s -X POST "$API/api/v1/order/create-order" -H "Authorization: Bearer $MAKER" \
  -H "Content-Type: application/json" \
  -d '{"marketId":"'"$MARKET"'","price":50000,"qty":2,"leverage":10,"orderType":"LIMIT","positionType":"SHORT"}' | jq

sleep 1

# Taker = LONG market for 2 -> fully fills against the maker at 50000
export TAKER=$(curl -s -X POST "$API/api/v1/auth/signup" -H "Content-Type: application/json" \
  -d '{"email":"taker-'$RANDOM'@example.com","password":"test123","role":"user"}' | jq -r .token)
curl -s -X POST "$API/api/v1/order/create-order" -H "Authorization: Bearer $TAKER" \
  -H "Content-Type: application/json" \
  -d '{"marketId":"'"$MARKET"'","price":0,"qty":2,"leverage":10,"orderType":"MARKET","positionType":"LONG"}' | jq

sleep 1

# Taker should now hold a LONG position of qty 2 @ 50000
curl -s "$API/api/v1/order/get-positions/$MARKET" -H "Authorization: Bearer $TAKER" | jq
curl -s "$API/api/v1/order/get-fills/$MARKET" -H "Authorization: Bearer $TAKER" | jq
```

To close + realize PnL, send the opposite MARKET order from the taker (and a
counterparty LIMIT to fill against).

---

## 8. WebSocket feeds (`websocat`)

The WS server (`:8080`) bridges Redis pub/sub channels. Subscribe with a JSON
message: `{ "type":"SUBSCRIBE", "channel", "market", "userId"? }`. Channels:
`depth`, `trade`, `ticker` (market-only), and `position`, `order`
(require `userId`). Internally the channel key is `channel:market` or
`channel:userId:market`.

Interactive (type the SUBSCRIBE line after it connects):

```bash
websocat ws://localhost:8080
{"type":"SUBSCRIBE","channel":"depth","market":"BTCUSDT"}
```

One-liners:

```bash
# Order book depth
echo '{"type":"SUBSCRIBE","channel":"depth","market":"BTCUSDT"}' | websocat -n ws://localhost:8080

# Trades
echo '{"type":"SUBSCRIBE","channel":"trade","market":"BTCUSDT"}' | websocat -n ws://localhost:8080

# Ticker / index price (driven by binance-ws)
echo '{"type":"SUBSCRIBE","channel":"ticker","market":"BTCUSDT"}' | websocat -n ws://localhost:8080

# Position updates for a specific user
echo '{"type":"SUBSCRIBE","channel":"position","market":"BTCUSDT","userId":"<USER_ID>"}' | websocat -n ws://localhost:8080

# Order updates for a specific user
echo '{"type":"SUBSCRIBE","channel":"order","market":"BTCUSDT","userId":"<USER_ID>"}' | websocat -n ws://localhost:8080
```

The server replies `{ "type":"SUBSCRIBED", "channel":"..." }` and then streams
events as orders match / prices tick. Keep a `trade`/`depth` subscription open in
one terminal while running the section 7 match in another.

---

## 9. Redis inspection & liquidation trigger (`redis-cli`)

Inspect the streams the backend and engine use:

```bash
# Orders the backend forwarded to the engine
redis-cli XRANGE send-to-engine - + COUNT 20

# Events the engine forwarded to the db-poller
redis-cli XRANGE send-to-dbpoller - + COUNT 20

# Last mark price cached by binance-ws
redis-cli GET mark:BTCUSDT
```

Force a mark-price move to drive unrealised PnL and trigger liquidation. The
engine listens on the `binance-markprices` channel; payload is
`{ "s": <market>, "p": <price-as-string> }`:

```bash
# Open a leveraged LONG first (section 7), then crash the price below its
# liquidation price to trigger auto-liquidation:
redis-cli PUBLISH binance-markprices '{"s":"BTCUSDT","p":"47000"}'

# Or pump it to liquidate a SHORT:
redis-cli PUBLISH binance-markprices '{"s":"BTCUSDT","p":"53000"}'
```

Watch the `trade`/`position` WS channels (section 8) while publishing to see the
liquidation fill come through.

---

## 10. Automated happy path

For a scripted run of the core flow (market -> users -> balance -> maker/taker
match -> position/fill assertions) see [`scripts/e2e-test.sh`](scripts/e2e-test.sh):

```bash
bash scripts/e2e-test.sh
```
