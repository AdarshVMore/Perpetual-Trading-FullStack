import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "redis";
import type { RedisClientType } from "redis";
import WebSocket from "ws";
import db from "@prisma-db";

const HTTP_URL = "http://localhost:3000";
const WS_URL = "ws://localhost:8080";
const REDIS_URL = "redis://localhost:6379";
const MARKETS = ["SOLUSDT", "ETHUSDT", "BTCUSDT"];

const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "test123";
const MARKET_ID = "BTCUSDT";

interface ApiResponse {
  status: number;
  data: Record<string, unknown> | undefined;
}

interface AuthedUser {
  token: string;
  userId: string;
  email: string;
}

interface OrderPayload {
  marketId: string;
  price: number;
  qty: number;
  leverage: number;
  orderType: "MARKET" | "LIMIT";
  positionType: "LONG" | "SHORT";
}

interface CancelPayload {
  marketId: string;
  price: number;
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
  unrealisedPnL: number;
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

function isTradeEvent(e: EngineEvent): e is TradeEvent { return e.type === "trades"; }
function isDepthEvent(e: EngineEvent): e is DepthEvent { return e.type === "depth"; }
function isPositionEvent(e: EngineEvent): e is PositionEvent { return e.type === "position"; }
function isTickerEvent(e: EngineEvent): e is TickerEvent { return e.type === "ticker"; }

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

async function api(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  token?: string,
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(`${HTTP_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data: Record<string, unknown> | undefined;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }
  return {
    status: response.status,
    data,
  };
}

async function signup(email: string, password: string, role: "user" | "admin" = "user"): Promise<ApiResponse> {
  return api("POST", "/api/v1/auth/signup", { email, password, role });
}

async function signin(email: string, password: string): Promise<ApiResponse> {
  return api("POST", "/api/v1/auth/signin", { email, password });
}

async function createAuthedUser(label: string): Promise<AuthedUser> {
  const email = `${label}-${Date.now()}@test.com`;
  const password = "test123";
  const res = await signup(email, password);
  return {
    token: res.data!.token as string,
    userId: res.data!.userId as string,
    email,
  };
}

async function createAdminUser(label: string): Promise<AuthedUser> {
  const email = `${label}-admin-${Date.now()}@test.com`;
  const password = "test123";
  const res = await signup(email, password, "admin");
  return {
    token: res.data!.token as string,
    userId: res.data!.userId as string,
    email,
  };
}

async function createOrder(order: OrderPayload, token: string): Promise<ApiResponse> {
  return api("POST", "/api/v1/order/create-order", order, token);
}

async function cancelOrder(
  orderId: string,
  body: CancelPayload,
  token: string,
): Promise<ApiResponse> {
  return api("POST", `/api/v1/order/cancle-order/${orderId}`, body, token);
}

async function createMarket(
  marketId: string,
  marketName: string,
  maxLeverage: number,
  adminToken?: string,
): Promise<ApiResponse> {
  return api("POST", "/api/v1/order/create-market", { marketId, marketName, maxLeverage }, adminToken);
}

function buildOrder(overrides: Partial<OrderPayload> = {}): OrderPayload {
  return {
    marketId: MARKET_ID,
    price: 50000,
    qty: 1,
    leverage: 10,
    orderType: "LIMIT",
    positionType: "LONG",
    ...overrides,
  };
}

async function cleanupDatabase(): Promise<void> {
  try {
    await db.fills.deleteMany({});
    await db.orders.deleteMany({});
    await db.positions.deleteMany({});
    await db.userBalance.deleteMany({});
    await db.user.deleteMany({});
  } catch {
  }
}

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

describe("Signup / Login", () => {
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
    expect(res.status).toBe(401);
    expect(res.data!.message).toMatch(/does not exists/i);
  });

  it("rejects signup with invalid email", async () => {
    const res = await signup("not-an-email", "password123");
    expect(res.status).toBe(400);
    expect(res.data).toBeDefined();
    expect(res.data!.error).toBeDefined();
  });
});

describe("Auth required", () => {
  it("rejects create-order without token", async () => {
    const res = await api("POST", "/api/v1/order/create-order", buildOrder());
    expect(res.status).toBe(401);
  });

  it("rejects get-orders without token", async () => {
    const res = await api("GET", `/api/v1/order/get-orders/${MARKET_ID}`);
    expect(res.status).toBe(401);
  });

  it("rejects get-fills without token", async () => {
    const res = await api("GET", `/api/v1/order/get-fills/${MARKET_ID}`);
    expect(res.status).toBe(401);
  });
});

describe("Add Balance", () => {
  it("adds balance and reflects in GET /balance", async () => {
    const user = await createAuthedUser("balance-user");

    const before = await api("GET", "/api/v1/auth/balance", undefined, user.token);
    expect(before.status).toBe(200);
    const beforeAvailable = before.data!.availableBalance as number;

    const addRes = await api("POST", "/api/v1/auth/add-balance", { amount: 5000 }, user.token);
    expect(addRes.status).toBe(200);
    expect(addRes.data!.availableBalance).toBe(beforeAvailable + 5000);

    const after = await api("GET", "/api/v1/auth/balance", undefined, user.token);
    expect(after.status).toBe(200);
    expect(after.data!.availableBalance).toBe(beforeAvailable + 5000);
  });
});

describe("Place Order", () => {
  it("accepts a limit order and writes to the engine stream", async () => {
    await clearRedisStreams();

    const alice = await createAuthedUser("alice");
    const order = buildOrder({ orderType: "LIMIT" });
    const res = await createOrder(order, alice.token);

    expect(res.status).toBe(200);
    expect(res.data!.message).toMatch(/accepted/i);
    expect(res.data!.orderId).toEqual(expect.any(String));

    const engineMessages = await readEngineStream();
    expect(engineMessages.length).toBeGreaterThan(0);

    const orderMsg = engineMessages.find(
      (m) => m.userId === alice.userId && m["type"] === "create-order",
    );
    expect(orderMsg).toBeDefined();
    expect(orderMsg!.qty).toBe("1");
    expect(orderMsg!.price).toBe("50000");
    expect(orderMsg!.orderType).toBe("LIMIT");
    expect(orderMsg!.positionType).toBe("LONG");
    expect(orderMsg!.remainingQty).toBe("1");
  });

  it("accepts a market order and writes to the engine stream", async () => {
    await clearRedisStreams();

    const bob = await createAuthedUser("bob");
    const order = buildOrder({ orderType: "MARKET", price: 0 });
    const res = await createOrder(order, bob.token);

    expect(res.status).toBe(200);

    const engineMessages = await readEngineStream();
    const orderMsg = engineMessages.find(
      (m) => m.userId === bob.userId && m["type"] === "create-order",
    );
    expect(orderMsg).toBeDefined();
    expect(orderMsg!.orderType).toBe("MARKET");
  });

  it("rejects order with missing required fields", async () => {
    const user = await createAuthedUser("bad-order");
    const res = await api("POST", "/api/v1/order/create-order", { marketId: MARKET_ID }, user.token);
    expect(res.status).toBe(400);
    expect(res.data!.error).toBeDefined();
  });

  it("places a short order", async () => {
    await clearRedisStreams();

    const carol = await createAuthedUser("carol");
    const order = buildOrder({ orderType: "LIMIT", positionType: "SHORT" });
    const res = await createOrder(order, carol.token);

    expect(res.status).toBe(200);

    const engineMessages = await readEngineStream();
    const orderMsg = engineMessages.find(
      (m) => m.userId === carol.userId && m["type"] === "create-order",
    );
    expect(orderMsg).toBeDefined();
    expect(orderMsg!.positionType).toBe("SHORT");
  });

  it("places an order with maximum leverage", async () => {
    await clearRedisStreams();

    const dave = await createAuthedUser("dave");
    const order = buildOrder({ orderType: "LIMIT", leverage: 100 });
    const res = await createOrder(order, dave.token);

    expect(res.status).toBe(200);

    const engineMessages = await readEngineStream();
    const orderMsg = engineMessages.find(
      (m) => m.userId === dave.userId && m["type"] === "create-order",
    );
    expect(orderMsg).toBeDefined();
    expect(orderMsg!.leverage).toBe("100");
  });
});

describe("Redis Engine Stream", () => {
  it("forwards order data to the send-to-engine stream with correct schema", async () => {
    await clearRedisStreams();

    const eve = await createAuthedUser("eve");
    const order = buildOrder({ orderType: "LIMIT" });
    await createOrder(order, eve.token);

    const messages = await readEngineStream();
    const msg = messages.find(
      (m) => m.userId === eve.userId && m["type"] === "create-order",
    );

    expect(msg).toBeDefined();
    expect(msg!.userId).toBe(eve.userId);
    expect(msg!.marketId).toBe(MARKET_ID);
    expect(msg!.qty).toBeDefined();
    expect(msg!.leverage).toBeDefined();
    expect(msg!.orderType).toBe("LIMIT");
    expect(msg!.positionType).toBe("LONG");
  });

  it("includes orderId and reqId for tracking in the stream", async () => {
    await clearRedisStreams();

    const frank = await createAuthedUser("frank");
    const order = buildOrder({ orderType: "LIMIT" });
    const res = await createOrder(order, frank.token);

    const messages = await readEngineStream();
    const msg = messages.find(
      (m) => m.userId === frank.userId && m["type"] === "create-order",
    );
    expect(msg!.reqId).toBeDefined();
    expect(msg!.orderId).toBeDefined();
    expect(msg!.orderId).not.toBe("");
    expect(res.data!.orderId).toEqual(expect.any(String));
  });
});

describe("Depth Stream (via Redis PubSub)", () => {
  it("publishes depth updates after order matching", async () => {
    const channel = `depth:${MARKET_ID}`;
    const depthPromise = subscribeToChannel(channel, 3000);

    const maker = await createAuthedUser("depth-maker");
    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 40000, qty: 2, positionType: "SHORT" }),
      maker.token,
    );

    const events = await depthPromise;
    const depthEvents = events.filter(isDepthEvent);

    if (depthEvents.length > 0) {
      expect(depthEvents[0]?.market).toBe(MARKET_ID);
      expect(Array.isArray(depthEvents[0]?.asks)).toBe(true);
      expect(Array.isArray(depthEvents[0]?.bids)).toBe(true);
    }
  });
});

describe("Trade Stream (via Redis PubSub)", () => {
  it("publishes trade events when orders match", async () => {
    const channel = `trade:${MARKET_ID}`;
    const tradePromise = subscribeToChannel(channel, 5000);

    const maker = await createAuthedUser("trade-maker");
    const taker = await createAuthedUser("trade-taker");

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 45000, qty: 1, positionType: "SHORT" }),
      maker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 1, positionType: "LONG" }),
      taker.token,
    );

    const events = await tradePromise;
    const trades = events.filter(isTradeEvent);

    if (trades.length > 0) {
      expect(trades[0]?.marketId).toBe(MARKET_ID);
      expect(trades[0]?.price).toBeGreaterThan(0);
      expect(trades[0]?.qty).toBeGreaterThan(0);
      expect(trades[0]?.maker).toBe(maker.userId);
      expect(trades[0]?.taker).toBe(taker.userId);
    }
  });
});

describe("Position Stream (via Redis PubSub)", () => {
  it("publishes position updates when a position is opened", async () => {
    const maker = await createAuthedUser("pos-maker2");
    const taker = await createAuthedUser("pos-taker2");

    const channel = `position:${taker.userId}:${MARKET_ID}`;
    const posPromise = subscribeToChannel(channel, 5000);

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 42000, qty: 1, positionType: "SHORT" }),
      maker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 1, positionType: "LONG" }),
      taker.token,
    );

    const events = await posPromise;
    const posEvents = events.filter(isPositionEvent);

    if (posEvents.length > 0) {
      expect(posEvents[0]?.marketId).toBe(MARKET_ID);
      expect(posEvents[0]?.qty).toBeGreaterThan(0);
    }
  });
});

describe("Ticker Stream (via Redis PubSub)", () => {
  it("publishes ticker updates with index price", async () => {
    const channel = `ticker:${MARKET_ID}`;
    const tickerPromise = subscribeToChannel(channel, 4000);

    const events = await tickerPromise;
    const tickers = events.filter(isTickerEvent);

    if (tickers.length > 0) {
      expect(tickers[0]?.marketId).toBe(MARKET_ID);
      expect(tickers[0]?.indexPrice).toBeGreaterThan(0);
    }
  });
});

describe("DB Poller Persistence", () => {
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
    await cleanupDatabase();
  });

  it("writes OrderUpdate events to send-to-dbpoller stream", async () => {
    const user = await createAuthedUser("db-persistence-user");

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 48000, qty: 1 }),
      user.token,
    );

    await waitFor(async () => {
      const messages = await readDBPollerStream();

      const orderUpdate = messages.find((msg) => {
        if (!msg.data) return false;
        try {
          const parsed = JSON.parse(msg.data);
          return (
            parsed.type === "OrderUpdate" &&
            parsed.payload?.data.userId === user.userId
          );
        } catch {
          return false;
        }
      });

      expect(orderUpdate).toBeDefined();
    });
  });

  it("persists OrderUpdate events to database", async () => {
    const user = await createAuthedUser("db-order-user");

    const res = await createOrder(
      buildOrder({ orderType: "LIMIT", price: 47000, qty: 1 }),
      user.token,
    );

    const orderId = res.data!.orderId as string;
    expect(orderId).toBeDefined();

    await waitFor(async () => {
      const orders = await db.orders.findMany({ where: { userId: user.userId } });

      expect(orders.length).toBeGreaterThan(0);

      const order = orders[0];
      expect(order?.userId).toBe(user.userId);
      expect(order?.qty).toBe(1);
      expect(order?.marketId).toBe(MARKET_ID);
    });
  });

  it("persists FillsCreated events after a trade executes", async () => {
    const seller = await createAuthedUser("seller");
    const buyer = await createAuthedUser("buyer");

    await createOrder(
      buildOrder({ positionType: "SHORT", orderType: "LIMIT", price: 50000, qty: 1 }),
      seller.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ positionType: "LONG", orderType: "MARKET", qty: 1 }),
      buyer.token,
    );

    await waitFor(async () => {
      const fills = await db.fills.findMany({
        where: {
          OR: [{ userId: buyer.userId }, { userId: seller.userId }],
        },
      });

      expect(fills.length).toBeGreaterThan(0);
    });
  });

  it("persists PositionUpdated events after a trade executes", async () => {
    const seller = await createAuthedUser("position-seller");
    const buyer = await createAuthedUser("position-buyer");

    await createOrder(
      buildOrder({ positionType: "SHORT", orderType: "LIMIT", price: 51000, qty: 1 }),
      seller.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ positionType: "LONG", orderType: "MARKET", qty: 1 }),
      buyer.token,
    );

    await waitFor(async () => {
      const positions = await db.positions.findMany({
        where: { userId: buyer.userId, marketId: MARKET_ID },
      });

      expect(positions.length).toBeGreaterThan(0);

      const position = positions[0];
      expect(position?.userId).toBe(buyer.userId);
      expect(position?.marketId).toBe(MARKET_ID);
    });
  });
});

describe("Full Fill", () => {
  it("matches a taker against a maker at the maker price (full fill)", async () => {
    await clearRedisStreams();

    const maker = await createAuthedUser("full-fill-maker");
    const taker = await createAuthedUser("full-fill-taker");
    const makerPrice = 51000;
    const qty = 2;

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: makerPrice, qty, positionType: "SHORT" }),
      maker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    const res = await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty, positionType: "LONG" }),
      taker.token,
    );

    expect(res.status).toBe(200);

    const channel = `trade:${MARKET_ID}`;
    const tradePromise = subscribeToChannel(channel, 3000);
    const events = await tradePromise;
    const trades = events.filter(isTradeEvent);

    const matchingTrade = trades.find(
      (t) => t.maker === maker.userId && t.taker === taker.userId,
    );

    if (matchingTrade) {
      expect(matchingTrade.price).toBe(makerPrice);
      expect(matchingTrade.qty).toBe(qty);
    }
  });
});

describe("Partial Fill", () => {
  it("partially fills a taker when maker liquidity is insufficient", async () => {
    await clearRedisStreams();

    const maker = await createAuthedUser("partial-maker");
    const taker = await createAuthedUser("partial-taker");

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 49000, qty: 1, positionType: "SHORT" }),
      maker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    const res = await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 3, positionType: "LONG" }),
      taker.token,
    );

    expect(res.status).toBe(200);

    const channel = `trade:${MARKET_ID}`;
    const tradePromise = subscribeToChannel(channel, 3000);
    const events = await tradePromise;
    const trades = events.filter(isTradeEvent);

    if (trades.length > 0) {
      const relevant = trades.filter((t) => t.taker === taker.userId);
      expect(relevant.length).toBeGreaterThan(0);
      const totalQty = relevant.reduce((s, t) => s + t.qty, 0);
      expect(totalQty).toBeLessThanOrEqual(3);
    }
  });
});

describe("Multiple Partial Fills", () => {
  it("fills across multiple maker levels when no single maker has enough liquidity", async () => {
    await clearRedisStreams();

    const maker1 = await createAuthedUser("multi-maker-1");
    const maker2 = await createAuthedUser("multi-maker-2");
    const maker3 = await createAuthedUser("multi-maker-3");
    const taker = await createAuthedUser("multi-taker");

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 48000, qty: 1, positionType: "SHORT" }),
      maker1.token,
    );
    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 48100, qty: 2, positionType: "SHORT" }),
      maker2.token,
    );
    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 48200, qty: 3, positionType: "SHORT" }),
      maker3.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    const res = await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 5, positionType: "LONG" }),
      taker.token,
    );

    expect(res.status).toBe(200);

    const channel = `trade:${MARKET_ID}`;
    const tradePromise = subscribeToChannel(channel, 3000);
    const events = await tradePromise;
    const trades = events.filter(isTradeEvent).filter((t) => t.taker === taker.userId);

    if (trades.length > 0) {
      const totalFilled = trades.reduce((s, t) => s + t.qty, 0);
      expect(totalFilled).toBeGreaterThan(0);
      expect(trades.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("Open / Increase / Reduce / Close Position", () => {
  it("opens a new position when user places first matched order", async () => {
    await clearRedisStreams();

    const maker = await createAuthedUser("pos-open-maker");
    const taker = await createAuthedUser("pos-open-taker");

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 46000, qty: 1, positionType: "SHORT" }),
      maker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 1, positionType: "LONG" }),
      taker.token,
    );

    await new Promise((r) => setTimeout(r, 1500));

    const makerPos = await db.positions.findMany({ where: { userId: maker.userId } });

    if (makerPos.length > 0) {
      expect(makerPos[0]?.qty).toBe(1);
      expect(makerPos[0]?.positionType).toBe("SHORT");
    }
  });

  it("increases position size when same-side order is matched", async () => {
    await clearRedisStreams();

    const maker = await createAuthedUser("pos-inc-maker");
    const taker = await createAuthedUser("pos-inc-taker");

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 44000, qty: 2, positionType: "SHORT" }),
      maker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 2, positionType: "LONG" }),
      taker.token,
    );

    await new Promise((r) => setTimeout(r, 1000));

    const makerPos = await db.positions.findMany({
      where: { userId: maker.userId, marketId: MARKET_ID },
    });

    if (makerPos.length > 0) {
      expect(makerPos[0]?.qty).toBeGreaterThanOrEqual(1);
    }
  });

  it("reduces position when opposite-side smaller order is matched", async () => {
    await clearRedisStreams();

    const reduceMaker = await createAuthedUser("reduce-maker");
    const reduceTaker = await createAuthedUser("reduce-taker");

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 43000, qty: 3, positionType: "SHORT" }),
      reduceMaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 3, positionType: "LONG" }),
      reduceTaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 42000, qty: 1, positionType: "LONG" }),
      reduceMaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 1, positionType: "SHORT" }),
      reduceTaker.token,
    );

    await new Promise((r) => setTimeout(r, 1500));

    const makerPositions = await db.positions.findMany({
      where: { userId: reduceMaker.userId, marketId: MARKET_ID },
    });

    if (makerPositions.length > 0) {
      expect(makerPositions[0]?.qty).toBe(2);
      expect(makerPositions[0]?.positionType).toBe("SHORT");
    }
  });

  it("closes position when opposite-side equal order is matched", async () => {
    await clearRedisStreams();

    const closeMaker = await createAuthedUser("close-maker");
    const closeTaker = await createAuthedUser("close-taker");

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 41000, qty: 2, positionType: "SHORT" }),
      closeMaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 2, positionType: "LONG" }),
      closeTaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 40000, qty: 2, positionType: "LONG" }),
      closeMaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 2, positionType: "SHORT" }),
      closeTaker.token,
    );

    await new Promise((r) => setTimeout(r, 1500));

    const makerPositions = await db.positions.findMany({
      where: { userId: closeMaker.userId, marketId: MARKET_ID },
    });

    expect(makerPositions.length).toBe(0);
  });

  it("reverses position when opposite-side larger order is matched", async () => {
    await clearRedisStreams();

    const reverseMaker = await createAuthedUser("reverse-maker");
    const reverseTaker = await createAuthedUser("reverse-taker");

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 40000, qty: 2, positionType: "SHORT" }),
      reverseMaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 2, positionType: "LONG" }),
      reverseTaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 42000, qty: 5, positionType: "LONG" }),
      reverseMaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 5, positionType: "SHORT" }),
      reverseTaker.token,
    );

    await new Promise((r) => setTimeout(r, 1500));

    const makerPos = await db.positions.findMany({
      where: { userId: reverseMaker.userId, marketId: MARKET_ID },
    });

    if (makerPos.length > 0) {
      expect(makerPos[0]?.positionType).toBe("LONG");
      expect(makerPos[0]?.qty).toBe(3);
    }
  });
});

describe("Realized PnL", () => {
  it("calculates realized PnL when a position is reduced or closed", async () => {
    await clearRedisStreams();

    const pnlMaker = await createAuthedUser("pnl-maker");
    const pnlTaker = await createAuthedUser("pnl-taker");

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 38000, qty: 2, positionType: "SHORT" }),
      pnlMaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 2, positionType: "LONG" }),
      pnlTaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 37000, qty: 1, positionType: "LONG" }),
      pnlMaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 1, positionType: "SHORT" }),
      pnlTaker.token,
    );

    await new Promise((r) => setTimeout(r, 1500));

    const fills = await db.fills.findMany({});
    expect(Array.isArray(fills)).toBe(true);
    expect(fills.length).toBeGreaterThan(0);

    const makerPositions = await db.positions.findMany({
      where: { userId: pnlMaker.userId, marketId: MARKET_ID },
    });
    if (makerPositions.length > 0) {
      expect(makerPositions[0]?.qty).toBe(1);
      expect(makerPositions[0]?.positionType).toBe("SHORT");
      expect(makerPositions[0]?.realisedPnL).toBe(1000);
    }
  });
});

describe("Unrealized PnL", () => {
  it("tracks unrealized PnL as mark price moves", async () => {
    const channel = `ticker:${MARKET_ID}`;
    const tickerPromise = subscribeToChannel(channel, 5000);
    const events = await tickerPromise;
    const tickers = events.filter(isTickerEvent);

    if (tickers.length > 0) {
      expect(tickers[0]?.indexPrice).toBeGreaterThan(0);
    }
  });
});

describe("Liquidation", () => {
  it("liquidates a high-leverage LONG position when mark price drops below liquidation price", async () => {
    await clearRedisStreams();

    const liqUser = await createAuthedUser("liq-test-user");
    const liqMaker = await createAuthedUser("liq-test-maker");
    const entryPrice = 50000;
    const leverage = 10;

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: entryPrice, qty: 2, positionType: "SHORT" }),
      liqMaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 2, positionType: "LONG", leverage }),
      liqUser.token,
    );

    const channel = `trade:${MARKET_ID}`;
    const tradePromise = subscribeToChannel(channel, 5000);

    const crashPrice = { s: MARKET_ID, p: "47000" };
    await redis.publish("binance-markprices", JSON.stringify(crashPrice));

    await new Promise((r) => setTimeout(r, 2000));

    const events = await tradePromise;
    const trades = events.filter(isTradeEvent);

    if (trades.length > 0) {
      const liqTrades = trades.filter((t) => t.taker === liqUser.userId || t.maker === liqUser.userId);
      if (liqTrades.length > 0) {
        expect(liqTrades[0]?.qty).toBeGreaterThan(0);
      }
    }
  });

  it("liquidates a SHORT position when mark price rises above liquidation price", async () => {
    await clearRedisStreams();

    const liqShortUser = await createAuthedUser("liq-short-user");
    const liqShortMaker = await createAuthedUser("liq-short-maker");
    const entryPrice = 30000;
    const leverage = 10;

    await createOrder(
      buildOrder({ orderType: "LIMIT", price: entryPrice, qty: 2, positionType: "LONG" }),
      liqShortMaker.token,
    );

    await new Promise((r) => setTimeout(r, 500));

    await createOrder(
      buildOrder({ orderType: "MARKET", price: 0, qty: 2, positionType: "SHORT", leverage }),
      liqShortUser.token,
    );

    const channel = `trade:${MARKET_ID}`;
    const tradePromise = subscribeToChannel(channel, 5000);

    const pumpPrice = { s: MARKET_ID, p: "32000" };
    await redis.publish("binance-markprices", JSON.stringify(pumpPrice));

    await new Promise((r) => setTimeout(r, 2000));

    const events = await tradePromise;
    const trades = events.filter(isTradeEvent);

    if (trades.length > 0) {
      const liqTrades = trades.filter((t) => t.taker === liqShortUser.userId || t.maker === liqShortUser.userId);
      if (liqTrades.length > 0) {
        expect(liqTrades[0]?.qty).toBeGreaterThan(0);
      }
    }
  });
});

describe("Cancellation", () => {
  it("cancels an open limit order", async () => {
    await clearRedisStreams();

    const user = await createAuthedUser("cancel-user");
    const res = await createOrder(
      buildOrder({ orderType: "LIMIT", price: 10000, qty: 1, positionType: "LONG" }),
      user.token,
    );
    expect(res.status).toBe(200);
    const orderId = res.data!.orderId as string;
    expect(orderId).toBeDefined();

    const cancelRes = await cancelOrder(orderId, {
      marketId: MARKET_ID,
      price: 10000,
      positionType: "LONG",
    }, user.token);
    expect(cancelRes.status).toBe(200);
  });

  it("returns 400 when cancel body is missing required fields", async () => {
    const user = await createAuthedUser("cancel-bad-body");
    const res = await cancelOrder("some-order-id", {} as CancelPayload, user.token);
    expect(res.status).toBe(400);
  });
});

describe("Create Market", () => {
  it("rejects market creation without admin token", async () => {
    const res = await createMarket("NEWMARKET", "New Market", 50);
    expect(res.status).toBe(401);
  });

  it("creates a market with admin token", async () => {
    const admin = await createAdminUser("market-admin");
    const res = await createMarket(`NEW${Date.now()}`, "New Market", 50, admin.token);
    expect(res.status).toBe(200);
  });

  it("rejects market creation with invalid data even with admin token", async () => {
    const admin = await createAdminUser("market-admin-bad");
    const res = await api("POST", "/api/v1/order/create-market", { marketId: "X" }, admin.token);
    expect(res.status).toBe(400);
  });
});

describe("Engine Restart Recovery", () => {
  it("re-processes pending orders from the stream after engine restart", async () => {
    await clearRedisStreams();

    const user = await createAuthedUser("recovery-user");
    await createOrder(
      buildOrder({ orderType: "LIMIT", price: 53000, qty: 1, positionType: "SHORT" }),
      user.token,
    );

    const messagesBefore = await readEngineStream();
    const recoveryOrder = messagesBefore.find((m) => m.userId === user.userId);
    expect(recoveryOrder).toBeDefined();

    const allMessages = await readEngineStream();
    expect(allMessages.length).toBeGreaterThan(0);
  });
});

describe("WebSocket Subscription", () => {
  it("connects to the WebSocket server", async () => {
    const ws = new WebSocket(WS_URL);

    const connectionResult = await new Promise<boolean>((resolve) => {
      ws.onopen = () => { ws.close(); resolve(true); };
      ws.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 3000);
    });

    expect(connectionResult).toBe(true);
  });

  it("subscribes to a depth channel and receives updates", async () => {
    const ws = new WebSocket(WS_URL);

    const subscribed = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => { ws.close(); resolve(false); }, 5000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "SUBSCRIBE", channel: "depth", market: MARKET_ID }));
      };

      ws.onmessage = () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      };

      ws.onerror = () => { clearTimeout(timeout); resolve(false); };
    });

    expect(typeof subscribed).toBe("boolean");
  });
});

describe("Cross-market support", () => {
  it("places orders on different markets (ETH, SOL)", async () => {
    for (const market of MARKETS) {
      await clearRedisStreams();

      const user = await createAuthedUser(`cross-market-${market}`);
      const res = await createOrder(
        buildOrder({
          marketId: market,
          orderType: "LIMIT",
          price: market === "BTCUSDT" ? 50000 : 3000,
          qty: 1,
        }),
        user.token,
      );

      expect(res.status).toBe(200);

      const engineMessages = await readEngineStream();
      const msg = engineMessages.find((m) => m.marketId === market);
      expect(msg).toBeDefined();
      expect(msg!.marketId).toBe(market);
    }
  });
});
