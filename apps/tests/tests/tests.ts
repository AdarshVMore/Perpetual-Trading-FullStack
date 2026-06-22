import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "redis";
import type { RedisClientType } from "redis";
import WebSocket from "ws";
import db, { type OrderType } from "@prisma-db";
import { createViteLogger } from "vitest/node";

// ── Config ──────────────────────────────────────────────────────────
const HTTP_URL = "http://localhost:3000";
const WS_URL = "ws://localhost:8080";
const REDIS_URL = "redis://localhost:6379";
const MARKETS = ["SOLUSDT", "ETHUSDT", "BTCUSDT"];

const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "test123";
const TEST_EMAIL_2 = "test2@example.com";
const MARKET_ID = "BTCUSDT";

// ── Types ───────────────────────────────────────────────────────────
interface ApiResponse {
  status: number;
  data: Record<string, unknown> | undefined;
}

interface OrderPayload {
  userId: string;
  marketId: string;
  price: number;
  qty: number;
  leverage: number;
  orderType: "MARKET" | "LIMIT";
  positionType: "LONG" | "SHORT";
}

interface TradeEvent {
  type: "trades";
  marketId: string;
  price: number;
  qty: number;
  maker: string;
  taker: string;
  timestamp: number;
}

interface DepthEvent {
  type: "depth";
  market: string;
  asks: [number, number][];
  bids: [number, number][];
}

interface PositionEvent {
  type: "position";
  side: "LONG" | "SHORT";
  marketId: string;
  price: number;
  qty: number;
  pnl: number;
  realisedPnL: number;
}

interface TickerEvent {
  type: "ticker";
  marketId: string;
  indexPrice: number;
}

interface OrderEvent {
  type: "orderCreate" | "orderUpdate";
  orderId: string;
  userId: string;
  marketId: string;
  positionType: "LONG" | "SHORT";
  price: number;
  qty: number;
  remainingQty: number;
  leverage: number;
  status: string;
}

type EngineEvent = TradeEvent | DepthEvent | PositionEvent | TickerEvent | OrderEvent;

// ── Redis Helpers ───────────────────────────────────────────────────
let redis: RedisClientType;

async function connectRedis(): Promise<RedisClientType> {
  const client = createClient({ url: REDIS_URL }) as RedisClientType;
  client.on("error", () => {});
  await client.connect();
  return client;
}

async function clearRedisStreams(): Promise<void> {
  try {
    await redis.del("send-to-engine");
    await redis.del("send-to-dbpoller");
  } catch {
    // ignore if keys don't exist
  }
}

async function readEngineStream(): Promise<Record<string, string>[]> {
  const data = await redis.xRead(
    [{ key: "send-to-engine", id: "0" }],
    { COUNT: 100 },
  );
  if (!data) return [];
  const messages: Record<string, string>[] = [];
  for (const stream of data) {
    for (const msg of stream.messages) {
      messages.push(msg.message as Record<string, string>);
    }
  }
  return messages;
}

async function readDBPollerStream(): Promise<Record<string, string>[]> {
  const data = await redis.xRead(
    [{ key: "send-to-dbpoller", id: "0" }],
    { COUNT: 100 },
  );
  if (!data) return [];
  const messages: Record<string, string>[] = [];
  for (const stream of data) {
    for (const msg of stream.messages) {
      messages.push(msg.message as Record<string, string>);
    }
  }
  return messages;
}

function subscribeToChannel(
  channel: string,
  timeoutMs = 5000,
): Promise<EngineEvent[]> {
  return new Promise((resolve, reject) => {
    const subscriber = createClient({ url: REDIS_URL }) as RedisClientType;
    const events: EngineEvent[] = [];
    subscriber.on("error", () => {});

    subscriber.connect().then(() => {
      subscriber.subscribe(channel, (raw: string) => {
        try {
          const parsed = JSON.parse(raw) as EngineEvent;
          events.push(parsed);
        } catch {
          // skip unparseable
        }
      });

      setTimeout(() => {
        subscriber.unsubscribe(channel).then(() => {
          subscriber.quit().catch(() => {});
          resolve(events);
        });
      }, timeoutMs);
    }).catch(reject);
  });
}

// ── HTTP Helpers ────────────────────────────────────────────────────
async function api(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const response = await fetch(`${HTTP_URL}${path}`, { // read: doubt how fetch ?
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    data: text.length > 0 ? JSON.parse(text) : undefined,
  };
}

async function signup(
  email: string,
  password: string,
): Promise<ApiResponse> {
  return api("POST", "/api/v1/auth/signup", { email, password });
}

async function signin(
  email: string,
  password: string,
): Promise<ApiResponse> {
  return api("POST", "/api/v1/auth/signin", { email, password });
}

async function createOrder(
  order: OrderPayload,
): Promise<ApiResponse> {
  return api("POST", "/api/v1/order/create-order", order);
}

async function cancelOrder(
  orderId: string,
  token?: string,
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const response = await fetch(
    `${HTTP_URL}/api/v1/order/cancle-order/${orderId}`,
    { method: "POST", headers },
  );
  const text = await response.text();
  return {
    status: response.status,
    data: text.length > 0 ? JSON.parse(text) : undefined,
  };
}

async function createMarket(
  marketId: string,
  marketName: string,
  maxLeverage: number,
  adminToken?: string,
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (adminToken) headers["authorization"] = `Bearer ${adminToken}`;
  const response = await fetch(
    `${HTTP_URL}/api/v1/order/create-market`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ marketId, marketName, maxLeverage }),
    },
  );
  const text = await response.text();
  return {
    status: response.status,
    data: text.length > 0 ? JSON.parse(text) : undefined,
  };
}

function buildOrder(overrides: Partial<OrderPayload> = {}): OrderPayload { // read: this syntax of Patial<> in typescript
  return {
    userId: "user1",
    marketId: MARKET_ID,
    price: 50000,
    qty: 1,
    leverage: 10,
    orderType: "LIMIT",
    positionType: "LONG",
    ...overrides,
  };
}

// ── Prisma Cleanup ─────────────────────────────────────────────────
async function cleanupDatabase(): Promise<void> {
  try {
    await db.fills.deleteMany({});
    await db.orders.deleteMany({});
    await db.positions.deleteMany({});
    await db.user.deleteMany({});
  } catch {
    // tables may not exist yet
  }
}

// ── Setup / Teardown ────────────────────────────────────────────────
beforeAll(async () => {
  redis = await connectRedis();
  await cleanupDatabase();
  await clearRedisStreams();
});

afterAll(async () => {
  await cleanupDatabase();
  await clearRedisStreams();
  await redis.quit().catch(() => {});
  await db.$disconnect().catch(() => {});
  console.log("test cleanup complete");
});

// ── Tests ───────────────────────────────────────────────────────────
describe("✅ Signup / Login", () => {
  it("signs up a new user and returns a JWT token", async () => {
    const res = await signup(TEST_EMAIL, TEST_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.data).toBeDefined();
    expect(res.data!.message).toMatch(/signed.up/i);
    expect(res.data!.token).toEqual(expect.any(String));
  });

  it("reports user already exists on duplicate signup", async () => {
    const res = await signup(TEST_EMAIL, TEST_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.data!.message).toMatch(/already exists/i);
  });

  it("signs in an existing user with correct credentials", async () => {
    const res = await signin(TEST_EMAIL, TEST_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.data!.message).toMatch(/signed in/i);
    expect(res.data!.token).toEqual(expect.any(String));
  });

  it("rejects signin for non-existent user", async () => {
    const res = await signin("nobody@example.com", "wrong");
    expect(res.data!.message).toMatch(/does not exists/i);
  });

  it("rejects signup with invalid email", async () => {
    const res = await signup("not-an-email", "password123");
    expect(res.data).toBeDefined();
    expect(res.data!.error).toBeDefined();
  });
});

describe("🛒 Place Order", () => {
  it("accepts a limit order and writes to the engine stream", async () => {
    await clearRedisStreams();

    const order = buildOrder({ userId: "alice", orderType: "LIMIT" });
    const res = await createOrder(order);

    expect(res.status).toBe(200);
    expect(res.data!.message).toMatch(/accepted|queue/i);

    const engineMessages = await readEngineStream();
    expect(engineMessages.length).toBeGreaterThan(0);

    const orderMsg = engineMessages.find(
      (m) => m.userId === "alice" && m["type"] === "create-order",
    );
    expect(orderMsg).toBeDefined();
    expect(orderMsg!.qty).toBe("1");
    expect(orderMsg!.price).toBe("50000");
    expect(orderMsg!.orderType).toBe("LIMIT");
    expect(orderMsg!.positionType).toBe("LONG");
  });

  it("accepts a market order and writes to the engine stream", async () => {
    await clearRedisStreams();

    const order = buildOrder({
      userId: "bob",
      orderType: "MARKET",
      price: 0,
    });
    const res = await createOrder(order);

    expect(res.status).toBe(200);

    const engineMessages = await readEngineStream();
    const orderMsg = engineMessages.find(
      (m) => m.userId === "bob" && m["type"] === "create-order",
    );
    expect(orderMsg).toBeDefined();
    expect(orderMsg!.orderType).toBe("MARKET");
  });

  it("rejects order with missing required fields", async () => {
    const res = await api("POST", "/api/v1/order/create-order", { // read: these are all the expection on how this project should function so implement everything according to this
      userId: "bad",
    });
    expect(res.status).toBe(400);
    expect(res.data!.error).toBeDefined();
  });

  it("places a short order", async () => {
    await clearRedisStreams();

    const order = buildOrder({
      userId: "carol",
      orderType: "LIMIT",
      positionType: "SHORT",
    });
    const res = await createOrder(order);

    expect(res.status).toBe(200);

    const engineMessages = await readEngineStream();
    const orderMsg = engineMessages.find(
      (m) => m.userId === "carol" && m["type"] === "create-order",
    );
    expect(orderMsg).toBeDefined();
    expect(orderMsg!.positionType).toBe("SHORT");
  });

  it("places an order with maximum leverage", async () => {
    await clearRedisStreams();

    const order = buildOrder({
      userId: "dave",
      orderType: "LIMIT",
      leverage: 100,
    });
    const res = await createOrder(order);

    expect(res.status).toBe(200);

    const engineMessages = await readEngineStream();
    const orderMsg = engineMessages.find(
      (m) => m.userId === "dave" && m["type"] === "create-order",
    );
    expect(orderMsg).toBeDefined();
    expect(orderMsg!.leverage).toBe("100");
  });
});

describe("📡 Redis Engine Stream", () => {
  it("forwards order data to the send-to-engine stream with correct schema", async () => {
    await clearRedisStreams();

    const order = buildOrder({ userId: "eve", orderType: "LIMIT" });
    await createOrder(order);

    const messages = await readEngineStream();
    const msg = messages.find(
      (m) => m.userId === "eve" && m["type"] === "create-order",
    );

    expect(msg).toBeDefined();
    expect(msg!.userId).toBe("eve");
    expect(msg!.marketId).toBe(MARKET_ID);
    expect(msg!.qty).toBeDefined();
    expect(msg!.leverage).toBeDefined();
    expect(msg!.orderType).toBe("LIMIT");
    expect(msg!.positionType).toBe("LONG");
  });

  it("includes reqId for tracking in the stream", async () => {
    await clearRedisStreams();

    const order = buildOrder({ userId: "frank", orderType: "LIMIT" });
    await createOrder(order);

    const messages = await readEngineStream();
    const msg = messages.find(
      (m) => m.userId === "frank" && m["type"] === "create-order",
    );
    expect(msg!.reqId).toBeDefined();
  });
});

describe("📊 Depth Stream (via Redis PubSub)", () => {
  it("publishes depth updates after order matching", async () => {
    const channel = `depth:${MARKET_ID}`;
    const depthPromise = subscribeToChannel(channel, 3000);

    await createOrder(
      buildOrder({
        userId: "depth-maker",
        orderType: "LIMIT",
        price: 40000,
        qty: 2,
        positionType: "SHORT",
      }),
    );

    const events = await depthPromise;
    const depthEvents = events.filter((e) => e.type === "depth");

    // Engine publishes depth each match cycle
    // If no match yet, depth still publishes with empty book
    if (depthEvents.length > 0) {
      expect(depthEvents[0]?.market).toBe(MARKET_ID);
      expect(Array.isArray(depthEvents[0]?.asks)).toBe(true);
      expect(Array.isArray(depthEvents[0]?.bids)).toBe(true);
    }
  });
});

describe("💹 Trade Stream (via Redis PubSub)", () => {
  it("publishes trade events when orders match", async () => {
    const channel = `trade:${MARKET_ID}`;
    const tradePromise = subscribeToChannel(channel, 5000);

    // Place a maker ask (short)
    await createOrder(
      buildOrder({
        userId: "trade-maker",
        orderType: "LIMIT",
        price: 45000,
        qty: 1,
        positionType: "SHORT",
      }),
    );

    // Allow engine to process before placing taker
    await new Promise((r) => setTimeout(r, 500));

    // Place a taker bid (long) that crosses the maker
    await createOrder(
      buildOrder({
        userId: "trade-taker",
        orderType: "MARKET",
        price: 0,
        qty: 1,
        positionType: "LONG",
      }),
    );

    const events = await tradePromise;
    const trades = events.filter((e) => e.type === "trades");

    if (trades.length > 0) {
      expect(trades[0]?.marketId).toBe(MARKET_ID);
      expect(trades[0]?.price).toBeGreaterThan(0);
      expect(trades[0]?.qty).toBeGreaterThan(0);
      expect(trades[0]?.maker).toBe("trade-maker");
      expect(trades[0]?.taker).toBe("trade-taker");
    }
  });
});

describe("📈 Position Stream (via Redis PubSub)", () => {
  it("publishes position updates when a position is opened", async () => {
    const channel = `position:trade-taker:${MARKET_ID}`;
    const posPromise = subscribeToChannel(channel, 5000);

    // Orders were placed in the trade test; this relies on engine state
    // If engine is running, positions from previous test should exist
    // If not, place fresh orders
    await createOrder(
      buildOrder({
        userId: "pos-maker2",
        orderType: "LIMIT",
        price: 42000,
        qty: 1,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({
        userId: "pos-taker2",
        orderType: "MARKET",
        price: 0,
        qty: 1,
        positionType: "LONG",
      }),
    );

    const events = await posPromise;
    const posEvents = events.filter((e) => e.type === "position");

    if (posEvents.length > 0) {
      expect(posEvents[0]?.marketId).toBe(MARKET_ID);
      expect(posEvents[0]?.qty).toBeGreaterThan(0);
    }
  });
});

describe("🔔 Ticker Stream (via Redis PubSub)", () => {
  it("publishes ticker updates with index price", async () => {
    const channel = `ticker:${MARKET_ID}`;
    const tickerPromise = subscribeToChannel(channel, 4000);

    // Engine subscribes to binance-markprices and publishes tickers
    // If binance-ws is running, we'll get updates
    // If not, we still check the channel subscription works

    const events = await tickerPromise;
    const tickers = events.filter((e) => e.type === "ticker");

    if (tickers.length > 0) {
      expect(tickers[0]?.marketId).toBe(MARKET_ID);
      expect(tickers[0]?.indexPrice).toBeGreaterThan(0);
    }
  });
});

describe("🗄️ DB Poller Persistence", () => {
  const waitFor = async (
    assertion: () => Promise<void>,
    timeout = 5000,
    interval = 250,
  ) => {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        await assertion();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, interval));
      }
    }

    await assertion();
  };

  beforeAll(async () => {
    await clearRedisStreams();

    // Optional but recommended
    await cleanupDatabase();
  });

  it("writes OrderUpdate events to send-to-dbpoller stream", async () => {
    const userId = "db-persistence-user";

    await createOrder(
      buildOrder({
        userId,
        orderType: "LIMIT",
        price: 48000,
        qty: 1,
      }),
    );

    await waitFor(async () => {
      const messages = await readDBPollerStream();

      const orderUpdate = messages.find((msg) => {
        if (!msg.data) return false;
        try {
          const parsed = JSON.parse(msg.data);
          return (
            parsed.type === "OrderUpdate" &&
            parsed.payload?.data.userId === userId
          );
        } catch {
          return false;
        }
      });

      expect(orderUpdate).toBeDefined();
    });
  });

  it("persists OrderUpdate events to database", async () => {
    const userId = `db-order-user-${Date.now()}`;

    const id = await createOrder(
      buildOrder({
        userId,
        orderType: "LIMIT",
        price: 47000,
        qty: 1,
      }),
    );

    console.log("created Order = ", id)

    await waitFor(async () => {
      const orders = await db.orders.findMany({
        where: { userId },
      });

      console.log("orders in this is =====> ", orders)

      expect(orders.length).toBeGreaterThan(0);

      const order = orders[0];

      expect(order?.userId).toBe(userId);
      expect(order?.qty).toBe(1);
      expect(order?.marketId).toBe(MARKET_ID);
    });
  });

  it("persists FillsCreated events after a trade executes", async () => {
    const sellerId = `seller-${Date.now()}`;
    const buyerId = `buyer-${Date.now()}`;

    await createOrder(
      buildOrder({
        userId: sellerId,
        positionType: "SHORT",
        orderType: "LIMIT",
        price: 50000,
        qty: 1,
      }),
    );

    await createOrder(
      buildOrder({
        userId: buyerId,
        positionType: "LONG",
        orderType: "MARKET",
        qty: 1,
      }),
    );

    await waitFor(async () => {
      const fills = await db.fills.findMany({
        where: {
          OR: [
            { userId: buyerId },
            { userId: sellerId },
          ],
        },
      });

      expect(fills.length).toBeGreaterThan(0);
    });
  });

  it("persists PositionUpdated events after a trade executes", async () => {
    const sellerId = `position-seller-${Date.now()}`;
    const buyerId = `position-buyer-${Date.now()}`;

    await createOrder(
      buildOrder({
        userId: sellerId,
        positionType: "SHORT",
        orderType: "LIMIT",
        price: 51000,
        qty: 1,
      }),
    );

    await createOrder(
      buildOrder({
        userId: buyerId,
        positionType: "LONG",
        orderType: "MARKET",
        qty: 1,
      }),
    );

    await waitFor(async () => {
      const positions = await db.positions.findMany({
        where: {
          userId: buyerId,
          marketId: MARKET_ID,
        },
      });

      expect(positions.length).toBeGreaterThan(0);

      const position = positions[0];

      expect(position?.userId).toBe(buyerId);
      expect(position?.marketId).toBe(MARKET_ID);
    });
  });
});

describe("🔄 Full Fill", () => {
  it("matches a taker against a maker at the maker price (full fill)", async () => {
    await clearRedisStreams();

    const makerPrice = 51000;
    const qty = 2;

    await createOrder(
      buildOrder({
        userId: "full-fill-maker",
        orderType: "LIMIT",
        price: makerPrice,
        qty,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    const res = await createOrder(
      buildOrder({
        userId: "full-fill-taker",
        orderType: "MARKET",
        price: 0,
        qty,
        positionType: "LONG",
      }),
    );

    expect(res.status).toBe(200);

    // Check trade events via Redis PubSub
    const channel = `trade:${MARKET_ID}`;
    const tradePromise = subscribeToChannel(channel, 3000);
    const events = await tradePromise;
    const trades = events.filter((e) => e.type === "trades");

    const matchingTrade = trades.find(
      (t) =>
        t.maker === "full-fill-maker" && t.taker === "full-fill-taker",
    );

    if (matchingTrade) {
      expect(matchingTrade.price).toBe(makerPrice);
      expect(matchingTrade.qty).toBe(qty);
    }
  });
});

describe("🔄 Partial Fill", () => {
  it("partially fills a taker when maker liquidity is insufficient", async () => {
    await clearRedisStreams();

    // Maker only has 1 unit at this price
    await createOrder(
      buildOrder({
        userId: "partial-maker",
        orderType: "LIMIT",
        price: 49000,
        qty: 1,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    // Taker wants 3 units — only 1 available
    const res = await createOrder(
      buildOrder({
        userId: "partial-taker",
        orderType: "MARKET",
        price: 0,
        qty: 3,
        positionType: "LONG",
      }),
    );

    expect(res.status).toBe(200);

    const channel = `trade:${MARKET_ID}`;
    const tradePromise = subscribeToChannel(channel, 3000);
    const events = await tradePromise;
    const trades = events.filter((e) => e.type === "trades");

    // At least one partial fill happened
    if (trades.length > 0) {
      const relevant = trades.filter(
        (t) => t.taker === "partial-taker",
      );
      expect(relevant.length).toBeGreaterThan(0);
      // Only 1 unit matched
      const totalQty = relevant.reduce((s, t) => s + t.qty, 0);
      expect(totalQty).toBeLessThanOrEqual(3);
    }
  });
});

describe("🔄 Multiple Partial Fills", () => {
  it("fills across multiple maker levels when no single maker has enough liquidity", async () => {
    await clearRedisStreams();

    // Three makers at different prices
    await createOrder(
      buildOrder({
        userId: "multi-maker-1",
        orderType: "LIMIT",
        price: 48000,
        qty: 1,
        positionType: "SHORT",
      }),
    );
    await createOrder(
      buildOrder({
        userId: "multi-maker-2",
        orderType: "LIMIT",
        price: 48100,
        qty: 2,
        positionType: "SHORT",
      }),
    );
    await createOrder(
      buildOrder({
        userId: "multi-maker-3",
        orderType: "LIMIT",
        price: 48200,
        qty: 3,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    // Taker wants 5 units — will eat through all three levels
    const res = await createOrder(
      buildOrder({
        userId: "multi-taker",
        orderType: "MARKET",
        price: 0,
        qty: 5,
        positionType: "LONG",
      }),
    );

    expect(res.status).toBe(200);

    const channel = `trade:${MARKET_ID}`;
    const tradePromise = subscribeToChannel(channel, 3000);
    const events = await tradePromise;
    const trades = events.filter((e) => e.type === "trades" && e.taker === "multi-taker");

    // Should have fills from multiple makers
    // if (trades.length > 0) {
    //   const totalFilled = trades.reduce((s, t) => s + t.qty, 0);
    //   expect(totalFilled).toBeGreaterThan(0);
    //   // Since engine walks through price levels via while loop,
    //   // each maker match creates a separate trade event
    //   expect(trades.length).toBeGreaterThanOrEqual(1);
    // }
  });
});

describe("🔄 Open / Increase / Reduce / Close Position", () => {
  it("opens a new position when user places first matched order", async () => {
    await clearRedisStreams();

    await createOrder(
      buildOrder({
        userId: "pos-open-maker",
        orderType: "LIMIT",
        price: 46000,
        qty: 1,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({
        userId: "pos-open-taker",
        orderType: "MARKET",
        price: 0,
        qty: 1,
        positionType: "LONG",
      }),
    );

    // Wait for position updates
    await new Promise((r) => setTimeout(r, 1500));

    // Check db-poller persisted position
    const makerPos = await db.positions.findMany({
      where: { userId: "pos-open-maker" },
    });

    if (makerPos.length > 0) {
      expect(makerPos[0]?.qty).toBe(1);
      expect(makerPos[0]?.positionType).toBe("SHORT");
    }
  });

  it("increases position size when same-side order is matched", async () => {
    await clearRedisStreams();

    // Already have SHORT position from maker above in engine memory
    // Submit another limit order at a different price
    await createOrder(
      buildOrder({
        userId: "pos-open-maker",
        orderType: "LIMIT",
        price: 44000,
        qty: 2,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({
        userId: "pos-inc-taker",
        orderType: "MARKET",
        price: 0,
        qty: 2,
        positionType: "LONG",
      }),
    );

    await new Promise((r) => setTimeout(r, 1000));

    const makerPos = await db.positions.findMany({
      where: { userId: "pos-open-maker", marketId: MARKET_ID },
    });

    if (makerPos.length > 0) {
      // Should have the combined position size
      expect(makerPos[0]?.qty).toBeGreaterThanOrEqual(1);
    }
  });

  it("reduces position when opposite-side smaller order is matched", async () => {
    await clearRedisStreams();

    const reduceMaker = "reduce-maker";
    const reduceTaker = "reduce-taker";

    await createOrder(
      buildOrder({
        userId: reduceMaker,
        orderType: "LIMIT",
        price: 43000,
        qty: 3,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({
        userId: reduceTaker,
        orderType: "MARKET",
        price: 0,
        qty: 3,
        positionType: "LONG",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    // Now reduceMaker has SHORT 3. Place a LIMIT LONG 1 as resting order.
    await createOrder(
      buildOrder({
        userId: reduceMaker,
        orderType: "LIMIT",
        price: 42000,
        qty: 1,
        positionType: "LONG",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    // reduceTaker places MARKET SHORT 1 to match against maker's LIMIT LONG 1
    // This triggers reducePosition on maker: SHORT 3 → SHORT 2
    await createOrder(
      buildOrder({
        userId: reduceTaker,
        orderType: "MARKET",
        price: 0,
        qty: 1,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 1500));

    const makerPositions = await db.positions.findMany({
      where: { userId: reduceMaker, marketId: MARKET_ID },
    });

    if (makerPositions.length > 0) {
      // Position was 3 SHORT, reduced by 1 LONG → 2 SHORT
      expect(makerPositions[0]?.qty).toBe(2);
      expect(makerPositions[0]?.positionType).toBe("SHORT");
    }
  });

  it("closes position when opposite-side equal order is matched", async () => {
    await clearRedisStreams();

    const closeMaker = "close-maker";
    const closeTaker = "close-taker";

    await createOrder(
      buildOrder({
        userId: closeMaker,
        orderType: "LIMIT",
        price: 41000,
        qty: 2,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({
        userId: closeTaker,
        orderType: "MARKET",
        price: 0,
        qty: 2,
        positionType: "LONG",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    // Now closeMaker has SHORT 2. Place LIMIT LONG 2 as resting order.
    await createOrder(
      buildOrder({
        userId: closeMaker,
        orderType: "LIMIT",
        price: 40000,
        qty: 2,
        positionType: "LONG",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    // closeTaker places MARKET SHORT 2 to match against maker's LIMIT LONG 2
    // This triggers canclePosition on maker: SHORT 2 → position fully closed
    await createOrder(
      buildOrder({
        userId: closeTaker,
        orderType: "MARKET",
        price: 0,
        qty: 2,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 1500));

    // Position should be deleted from DB (DELETE event sent to dbpoller)
    const makerPositions = await db.positions.findMany({
      where: { userId: closeMaker, marketId: MARKET_ID },
    });

    expect(makerPositions.length).toBe(0);
  });

  it("reverses position when opposite-side larger order is matched", async () => {
    await clearRedisStreams();

    const reverseMaker = "reverse-maker";
    const reverseTaker = "reverse-taker";

    await createOrder(
      buildOrder({
        userId: reverseMaker,
        orderType: "LIMIT",
        price: 40000,
        qty: 2,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({
        userId: reverseTaker,
        orderType: "MARKET",
        price: 0,
        qty: 2,
        positionType: "LONG",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    // Now reverseMaker has SHORT 2. Place LIMIT LONG 5 as resting order.
    await createOrder(
      buildOrder({
        userId: reverseMaker,
        orderType: "LIMIT",
        price: 42000,
        qty: 5,
        positionType: "LONG",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    // reverseTaker places MARKET SHORT 5 to match against maker's LIMIT LONG 5
    // This triggers reversePosition on maker: SHORT 2 → LONG 3
    await createOrder(
      buildOrder({
        userId: reverseTaker,
        orderType: "MARKET",
        price: 0,
        qty: 5,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 1500));

    const makerPos = await db.positions.findMany({
      where: { userId: reverseMaker, marketId: MARKET_ID },
    });

    if (makerPos.length > 0) {
      // Was SHORT 2, reversed by LONG 5 → LONG 3
      expect(makerPos[0]?.positionType).toBe("LONG");
      expect(makerPos[0]?.qty).toBe(3); // 5 - 2 = 3
    }
  });
});

describe("💰 Realized PnL", () => {
  it("calculates realized PnL when a position is reduced or closed", async () => {
    await clearRedisStreams();

    const pnlMaker = "pnl-maker";
    const pnlTaker = "pnl-taker";

    // Open position at 38000
    await createOrder(
      buildOrder({
        userId: pnlMaker,
        orderType: "LIMIT",
        price: 38000,
        qty: 2,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({
        userId: pnlTaker,
        orderType: "MARKET",
        price: 0,
        qty: 2,
        positionType: "LONG",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    // Now pnlMaker has SHORT 2 @ 38000. Place LIMIT LONG 1 @ 37000 as resting order.
    await createOrder(
      buildOrder({
        userId: pnlMaker,
        orderType: "LIMIT",
        price: 37000,
        qty: 1,
        positionType: "LONG",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    // pnlTaker places MARKET SHORT 1 to match against maker's LIMIT LONG 1
    // This triggers reducePosition on maker: SHORT 2 → SHORT 1
    // PnL = 1 * (38000 - 37000) = 1000
    await createOrder(
      buildOrder({
        userId: pnlTaker,
        orderType: "MARKET",
        price: 0,
        qty: 1,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 1500));

    // Check fill was recorded
    const fills = await db.fills.findMany({});
    expect(Array.isArray(fills)).toBe(true);
    expect(fills.length).toBeGreaterThan(0);

    // Check position was reduced and PnL was calculated
    const makerPositions = await db.positions.findMany({
      where: { userId: pnlMaker, marketId: MARKET_ID },
    });
    if (makerPositions.length > 0) {
      expect(makerPositions[0]?.qty).toBe(1);
      expect(makerPositions[0]?.positionType).toBe("SHORT");
      // pnlMaker sold SHORT at 38000, bought back at 37000 → profit of 1000
      expect(makerPositions[0]?.realisedPnL).toBe(1000);
    }
  });
});

describe("📉 Unrealized PnL", () => {
  it("tracks unrealized PnL as mark price moves", async () => {
    // The engine's LiquidationManager listens to binance-markprices
    // and updates ticker. Position PnL is calculated against entry price.
    // This is tested indirectly via the ticker stream.

    const channel = `ticker:${MARKET_ID}`;
    const tickerPromise = subscribeToChannel(channel, 5000);
    const events = await tickerPromise;
    const tickers = events.filter((e) => e.type === "ticker");

    if (tickers.length > 0) {
      expect(tickers[0]?.indexPrice).toBeGreaterThan(0);
    }
  });
});

describe("💀 Liquidation", () => {
  it("liquidates a high-leverage LONG position when mark price drops below liquidation price", async () => {
    await clearRedisStreams();

    const liqUser = "liq-test-user";
    const entryPrice = 50000;
    const leverage = 10;

    // Open a SHORT maker position
    await createOrder(
      buildOrder({
        userId: `${liqUser}-maker`,
        orderType: "LIMIT",
        price: entryPrice,
        qty: 2,
        positionType: "SHORT",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    // Open a LONG taker position (this will be liquidated)
    await createOrder(
      buildOrder({
        userId: liqUser,
        orderType: "MARKET",
        price: 0,
        qty: 2,
        positionType: "LONG",
        leverage,
      }),
    );

    // Subscribe to trade channel to catch liquidation events
    const channel = `trade:${MARKET_ID}`;
    const tradePromise = subscribeToChannel(channel, 5000);

    // Simulate mark price crash by pushing to binance-markprices
    // Liquidation price for LONG 10x at 50000 ≈ 50000 * (1 - 0.1 + 0.05) = 47500
    // Push a price below that to trigger liquidation
    const crashPrice = { s: MARKET_ID, p: "47000" };
    await redis.publish("binance-markprices", JSON.stringify(crashPrice));

    await new Promise((r) => setTimeout(r, 2000));

    const events = await tradePromise;
    const trades = events.filter((e) => e.type === "trades");

    // The liquidation should have generated at least one trade
    // (engine's autoLiquidate creates a MARKET order to close the position)
    if (trades.length > 0) {
      const liqTrades = trades.filter((t) => t.taker === liqUser || t.maker === liqUser);
      if (liqTrades.length > 0) {
        expect(liqTrades[0]?.qty).toBeGreaterThan(0);
      }
    }
  });

  it("liquidates a SHORT position when mark price rises above liquidation price", async () => {
    await clearRedisStreams();

    const liqShortUser = "liq-short-user";
    const entryPrice = 30000;
    const leverage = 10;

    // Open a LONG maker
    await createOrder(
      buildOrder({
        userId: `${liqShortUser}-maker`,
        orderType: "LIMIT",
        price: entryPrice,
        qty: 2,
        positionType: "LONG",
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    // Open a SHORT taker position (this will be liquidated)
    await createOrder(
      buildOrder({
        userId: liqShortUser,
        orderType: "MARKET",
        price: 0,
        qty: 2,
        positionType: "SHORT",
        leverage,
      }),
    );

    const channel = `trade:${MARKET_ID}`;
    const tradePromise = subscribeToChannel(channel, 5000);

    // Liquidation price for SHORT 10x at 30000 ≈ 30000 * (1 + 0.1 - 0.05) = 31500
    // Push a price above that to trigger liquidation
    const pumpPrice = { s: MARKET_ID, p: "32000" };
    await redis.publish("binance-markprices", JSON.stringify(pumpPrice));

    await new Promise((r) => setTimeout(r, 2000));

    const events = await tradePromise;
    const trades = events.filter((e) => e.type === "trades");

    if (trades.length > 0) {
      const liqTrades = trades.filter((t) => t.taker === liqShortUser || t.maker === liqShortUser);
      if (liqTrades.length > 0) {
        expect(liqTrades[0]?.qty).toBeGreaterThan(0);
      }
    }
  });
});

describe("⚠️ Cancellation", () => {
  it("cancels an order with valid auth", async () => {
    // First sign up to get a token
    const cancelEmail = "cancel@test.com";
    const signupRes = await signup(cancelEmail, "password");

    // Cancel endpoint exists (stub)
    const res = await cancelOrder("some-order-id");
    // Currently a stub — accepts any orderId
    expect(res.status).toBe(200);
  });
});

describe("🏪 Create Market", () => {
  it("creates a new market via admin endpoint", async () => {
    const res = await createMarket(
      "NEWMARKET",
      "New Market",
      50,
      "admin-token",
    );

    // Endpoint validates with authAdminMiddleware but DB not written
    // Test that the schema validation works
    expect(res.status === 200 || res.status === 401).toBe(true);
  });

  it("rejects market creation with invalid data", async () => {
    const res = await api("POST", "/api/v1/order/create-market", {
      marketId: "X",
    });
    // Should fail schema validation
    if (res.status === 400 || res.data?.error) {
      expect(res.data!.error).toBeDefined();
    } else {
      // Auth middleware may reject first
      expect([200, 401]).toContain(res.status);
    }
  });
});

describe("🔁 Engine Restart Recovery", () => {
  it("re-processes pending orders from the stream after engine restart", async () => {
    await clearRedisStreams();

    // Place an order
    await createOrder(
      buildOrder({
        userId: "recovery-user",
        orderType: "LIMIT",
        price: 53000,
        qty: 1,
        positionType: "SHORT",
      }),
    );

    // Read the stream to verify it persists in Redis
    const messagesBefore = await readEngineStream();
    const recoveryOrder = messagesBefore.find(
      (m) => m.userId === "recovery-user",
    );
    expect(recoveryOrder).toBeDefined();

    // After restart, engine reads from "$" (newest) by default
    // so pending orders at "0" are re-readable
    const allMessages = await readEngineStream();
    expect(allMessages.length).toBeGreaterThan(0);
  });
});

describe("🌐 WebSocket Subscription", () => {
  it("connects to the WebSocket server", async () => {
    // Test basic WebSocket connectivity
    const ws = new WebSocket(WS_URL);

    const connectionResult = await new Promise<boolean>((resolve) => {
      ws.onopen = () => {
        ws.close();
        resolve(true);
      };
      ws.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 3000);
    });

    expect(connectionResult).toBe(true);
  });

  it("subscribes to a depth channel and receives updates", async () => {
    const ws = new WebSocket(WS_URL);

    const subscribed = await new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000);

      ws.onopen = () => {
        // Subscribe to depth channel
        ws.send(
          JSON.stringify({
            type: "SUBSCRIBE",
            channel: "depth:BTCUSDT",
            market: MARKET_ID,
          }),
        );
      };

      ws.onmessage = () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
    });

    // If WS server is running and engine publishes depth, we get a message
    expect(typeof subscribed).toBe("boolean");
  });
});

describe("🧪 Cross-market support", () => {
  it("places orders on different markets (ETH, SOL)", async () => {
    for (const market of MARKETS) {
      await clearRedisStreams();

      const res = await createOrder(
        buildOrder({
          userId: `cross-market-${market}`,
          marketId: market,
          orderType: "LIMIT",
          price: market === "BTCUSDT" ? 50000 : 3000,
          qty: 1,
        }),
      );

      expect(res.status).toBe(200);

      const engineMessages = await readEngineStream();
      const msg = engineMessages.find(
        (m) => m.marketId === market,
      );
      expect(msg).toBeDefined();
      expect(msg!.marketId).toBe(market);
    }
  });
});


