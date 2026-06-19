import { beforeEach, describe, expect, it } from "vitest";

const BASE_URL = "http://localhost:3000";
const SYMBOL = "BTC-PERP";
const MAINTENANCE_MARGIN_RATE = 0.005;
const TEST_TIMESTAMP = 1_710_000_000_000;

interface UserRequest {
  userId: string;
  initialBalance: number;
}

interface OrderRequest {
  userId: string;
  symbol: string;
  side: "long" | "short";
  type: "limit" | "market";
  quantity: number;
  price?: number;
  leverage?: number;
  postOnly?: boolean;
  clientOrderId?: string;
}

interface Fill {
  price: number;
  quantity: number;
  makerOrderId: string;
  makerUserId: string;
  takerUserId: string;
}

interface MarginChange {
  locked: number;
  used: number;
  released: number;
}

interface OrderResponse {
  orderId?: string;
  status: "resting" | "filled" | "partially_filled" | "cancelled" | "rejected";
  reason?: string;
  fills: Fill[];
  remainingQuantity: number;
  cancelledQuantity: number;
  margin: MarginChange;
}

interface BookLevel {
  orderId: string;
  userId: string;
  price: number;
  quantity: number;
}

interface OrderBookResponse {
  symbol: string;
  bids: BookLevel[];
  asks: BookLevel[];
}

interface BalanceResponse {
  userId: string;
  availableBalance: number;
  lockedMargin: number;
  totalEquity: number;
  realizedPnl: number;
}

interface Position {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  averageEntryPrice: number;
  margin: number;
  unrealizedPnl: number;
  liquidationPrice: number;
}

interface PositionsResponse {
  userId: string;
  positions: Position[];
}

interface FundingResponse {
  symbol: string;
  rate: number;
  payments: Array<{
    userId: string;
    amount: number;
    side: "long" | "short";
  }>;
  liquidations: Array<{
    userId: string;
    symbol: string;
  }>;
}

interface MarkPriceResponse {
  symbol: string;
  markPrice: number;
  liquidations: Array<{
    userId: string;
    symbol: string;
    reason: string;
  }>;
}

interface InsuranceFundResponse {
  symbol: string;
  balance: number;
}

interface AdlEventsResponse {
  events: Array<{
    userId: string;
    symbol: string;
    reducedQuantity: number;
    bankruptcyPrice: number;
  }>;
}

async function api<TResponse>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<TResponse> {
  const url = new URL(path, BASE_URL);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(
      `Could not reach the student backend at ${BASE_URL}. Start the backend first or set BASE_URL. Original error: ${String(error)}`,
    );
  }

  const text = await response.text();
  const data = text.length > 0 ? JSON.parse(text) : undefined;

  if (!response.ok)
    throw new Error(`${method} ${path} returned ${response.status}: ${text}`);

  return data as TResponse;
}

async function resetExchange(): Promise<void> {
  await api("POST", "/api/reset", {});
}

async function createUser(userId: string, initialBalance: number): Promise<void> {
  await api("POST", "/api/users", { userId, initialBalance } satisfies UserRequest);
}

async function placeOrder(order: OrderRequest): Promise<OrderResponse> {
  return api<OrderResponse>("POST", "/api/orders", order);
}

async function getOrderBook(): Promise<OrderBookResponse> {
  return api<OrderBookResponse>("GET", `/api/orderbook/${SYMBOL}`);
}

async function getBalance(userId: string): Promise<BalanceResponse> {
  return api<BalanceResponse>("GET", `/api/users/${userId}/balance`);
}

async function getPositions(userId: string): Promise<PositionsResponse> {
  return api<PositionsResponse>("GET", `/api/users/${userId}/positions`);
}

async function applyFunding(rate: number): Promise<FundingResponse> {
  return api<FundingResponse>("POST", "/api/funding", {
    symbol: SYMBOL,
    rate,
    timestamp: TEST_TIMESTAMP,
    runLiquidation: true,
  });
}

async function updateMarkPrice(markPrice: number): Promise<MarkPriceResponse> {
  return api<MarkPriceResponse>("POST", "/api/mark-price", {
    symbol: SYMBOL,
    markPrice,
    timestamp: TEST_TIMESTAMP,
    runLiquidation: true,
  });
}

async function getInsuranceFund(): Promise<InsuranceFundResponse> {
  return api<InsuranceFundResponse>("GET", `/api/insurance-fund/${SYMBOL}`);
}

async function getAdlEvents(): Promise<AdlEventsResponse> {
  return api<AdlEventsResponse>("GET", "/api/adl-events");
}

function limitOrder(
  userId: string,
  side: "long" | "short",
  price: number,
  quantity: number,
  overrides: Partial<OrderRequest> = {},
): OrderRequest {
  return {
    userId,
    symbol: SYMBOL,
    side,
    type: "limit",
    price,
    quantity,
    leverage: 1,
    ...overrides,
  };
}

function marketOrder(
  userId: string,
  side: "long" | "short",
  quantity: number,
  overrides: Partial<OrderRequest> = {},
): OrderRequest {
  return {
    userId,
    symbol: SYMBOL,
    side,
    type: "market",
    quantity,
    leverage: 1,
    ...overrides,
  };
}

function expectMoney(actual: number, expected: number): void {
  expect(actual).toBeCloseTo(expected, 8);
}

function expectSinglePosition(
  response: PositionsResponse,
  expected: Pick<Position, "symbol" | "side" | "quantity" | "averageEntryPrice" | "margin">,
): Position {
  expect(response.positions).toHaveLength(1);
  const position = response.positions[0]!;
  expect(position).toBeDefined();
  expect(position).toMatchObject({
    symbol: expected.symbol,
    side: expected.side,
  });
  expectMoney(position.quantity, expected.quantity);
  expectMoney(position.averageEntryPrice, expected.averageEntryPrice);
  expectMoney(position.margin, expected.margin);
  return position;
}

async function seedMatchedPosition(
  makerId: string,
  takerId: string,
  price: number,
  quantity: number,
  leverage = 1,
): Promise<void> {
  await createUser(makerId, 100_000);
  await createUser(takerId, 100_000);
  await placeOrder(limitOrder(makerId, "short", price, quantity, { leverage }));
  const response = await placeOrder(marketOrder(takerId, "long", quantity, { leverage }));
  expect(response.status).toBe("filled");
}

beforeEach(async () => {
  await resetExchange();
});

describe("Perpetual CEX HTTP contract: order matching", () => {
  it("rests a maker limit order in the order book and locks margin", async () => {
    await createUser("maker", 1_000);

    const response = await placeOrder(limitOrder("maker", "long", 105, 5));

    expect(response).toMatchObject({
      status: "resting",
      fills: [],
      remainingQuantity: 5,
      cancelledQuantity: 0,
    });
    expect(response.orderId).toEqual(expect.any(String));
    expectMoney(response.margin.locked, 525);
    expectMoney(response.margin.used, 0);
    expectMoney(response.margin.released, 0);

    const book = await getOrderBook();
    expect(book.bids).toHaveLength(1);
    expect(book.asks).toHaveLength(0);
    expect(book.bids[0]).toMatchObject({
      orderId: response.orderId,
      userId: "maker",
      price: 105,
      quantity: 5,
    });

    const balance = await getBalance("maker");
    expectMoney(balance.availableBalance, 475);
    expectMoney(balance.lockedMargin, 525);
  });

  it("matches a market taker against a maker at the maker price", async () => {
    await createUser("maker", 10_000);
    await createUser("taker", 10_000);
    const makerOrder = await placeOrder(limitOrder("maker", "long", 105, 5));

    const response = await placeOrder(marketOrder("taker", "short", 5, { price: 105 }));

    expect(response.status).toBe("filled");
    expect(response.fills).toEqual([
      {
        price: 105,
        quantity: 5,
        makerOrderId: makerOrder.orderId,
        makerUserId: "maker",
        takerUserId: "taker",
      },
    ]);
    expectMoney(response.margin.used, 525);
    expectMoney(response.remainingQuantity, 0);
    expectMoney(response.cancelledQuantity, 0);

    const takerPositions = await getPositions("taker");
    expectSinglePosition(takerPositions, {
      symbol: SYMBOL,
      side: "short",
      quantity: 5,
      averageEntryPrice: 105,
      margin: 525,
    });
  });

  it("executes a crossing limit order immediately at the better maker price", async () => {
    await createUser("maker", 10_000);
    await createUser("taker", 10_000);
    await placeOrder(limitOrder("maker", "short", 105, 5));

    const response = await placeOrder(limitOrder("taker", "long", 110, 5));

    expect(response.status).toBe("filled");
    expect(response.fills).toHaveLength(1);
    expectMoney(response.fills[0]?.price ?? 0, 105);
    expectMoney(response.margin.used, 525);

    const book = await getOrderBook();
    expect(book.bids).toHaveLength(0);
    expect(book.asks).toHaveLength(0);
  });

  it("fills same-price makers by time priority", async () => {
    await createUser("maker-a", 10_000);
    await createUser("maker-b", 10_000);
    await createUser("taker", 10_000);
    const firstMaker = await placeOrder(limitOrder("maker-a", "short", 105, 3));
    const secondMaker = await placeOrder(limitOrder("maker-b", "short", 105, 3));

    const response = await placeOrder(marketOrder("taker", "long", 4, { price: 105 }));

    expect(response.status).toBe("filled");
    expect(response.fills).toEqual([
      {
        price: 105,
        quantity: 3,
        makerOrderId: firstMaker.orderId,
        makerUserId: "maker-a",
        takerUserId: "taker",
      },
      {
        price: 105,
        quantity: 1,
        makerOrderId: secondMaker.orderId,
        makerUserId: "maker-b",
        takerUserId: "taker",
      },
    ]);

    const book = await getOrderBook();
    expect(book.asks).toHaveLength(1);
    expect(book.asks[0]).toMatchObject({
      orderId: secondMaker.orderId,
      userId: "maker-b",
      price: 105,
      quantity: 2,
    });
  });

  it("fills multiple maker prices in price-time priority and stores weighted average entry", async () => {
    await createUser("maker-100", 10_000);
    await createUser("maker-102", 10_000);
    await createUser("maker-105", 10_000);
    await createUser("taker", 10_000);
    await placeOrder(limitOrder("maker-105", "short", 105, 3));
    await placeOrder(limitOrder("maker-100", "short", 100, 3));
    await placeOrder(limitOrder("maker-102", "short", 102, 4));

    const response = await placeOrder(marketOrder("taker", "long", 10, { price: 105 }));

    expect(response.status).toBe("filled");
    expect(response.fills.map((fill) => [fill.price, fill.quantity])).toEqual([
      [100, 3],
      [102, 4],
      [105, 3],
    ]);

    const positions = await getPositions("taker");
    expectSinglePosition(positions, {
      symbol: SYMBOL,
      side: "long",
      quantity: 10,
      averageEntryPrice: 102.3,
      margin: 1_023,
    });
  });

  it("cancels the unfilled remainder of a partially filled market order", async () => {
    await createUser("maker", 10_000);
    await createUser("taker", 10_000);
    await placeOrder(limitOrder("maker", "short", 100, 5));

    const response = await placeOrder(marketOrder("taker", "long", 10, { price: 100 }));

    expect(response.status).toBe("partially_filled");
    expect(response.fills).toHaveLength(1);
    expectMoney(response.remainingQuantity, 0);
    expectMoney(response.cancelledQuantity, 5);
    expectMoney(response.margin.used, 500);
    expectMoney(response.margin.released, 500);

    const book = await getOrderBook();
    expect(book.bids).toHaveLength(0);
    expect(book.asks).toHaveLength(0);
  });

  it("keeps the unfilled remainder of a partially filled limit order resting", async () => {
    await createUser("maker", 10_000);
    await createUser("taker", 10_000);
    await placeOrder(limitOrder("maker", "short", 100, 5));

    const response = await placeOrder(limitOrder("taker", "long", 105, 10));

    expect(response.status).toBe("partially_filled");
    expectMoney(response.remainingQuantity, 5);
    expectMoney(response.cancelledQuantity, 0);
    expectMoney(response.margin.used, 500);
    expectMoney(response.margin.locked, 1_050);

    const book = await getOrderBook();
    expect(book.bids).toHaveLength(1);
    expect(book.bids[0]).toMatchObject({
      orderId: response.orderId,
      userId: "taker",
      price: 105,
      quantity: 5,
    });

    const balance = await getBalance("taker");
    expectMoney(balance.availableBalance, 8_950);
    expectMoney(balance.lockedMargin, 525);
  });

  it("rejects an order before execution when pre-trade margin is insufficient", async () => {
    await createUser("maker", 10_000);
    await createUser("taker", 500);
    await placeOrder(limitOrder("maker", "short", 100, 10));

    const response = await placeOrder(marketOrder("taker", "long", 10, { price: 100 }));

    expect(response.status).toBe("rejected");
    expect(response.fills).toEqual([]);
    expectMoney(response.cancelledQuantity, 10);
    expect(response.reason).toMatch(/margin/i);

    const makerBook = await getOrderBook();
    expect(makerBook.asks).toHaveLength(1);
    expectMoney(makerBook.asks[0]?.quantity ?? 0, 10);
  });

  it("accepts and executes an order with exact required margin", async () => {
    await createUser("maker", 10_000);
    await createUser("taker", 1_000);
    await placeOrder(limitOrder("maker", "short", 100, 10));

    const response = await placeOrder(marketOrder("taker", "long", 10, { price: 100 }));

    expect(response.status).toBe("filled");
    expectMoney(response.margin.used, 1_000);

    const balance = await getBalance("taker");
    expectMoney(balance.availableBalance, 0);
    expectMoney(balance.lockedMargin, 0);
  });

  it("rejects or cancels a no-liquidity market order without resting it", async () => {
    await createUser("taker", 10_000);

    const response = await placeOrder(marketOrder("taker", "long", 5, { price: 100 }));

    expect(["cancelled", "rejected"]).toContain(response.status);
    expect(response.fills).toEqual([]);
    expectMoney(response.remainingQuantity, 0);
    expectMoney(response.cancelledQuantity, 5);

    const book = await getOrderBook();
    expect(book.bids).toHaveLength(0);
    expect(book.asks).toHaveLength(0);
  });

  it("rejects a post-only order that would immediately take liquidity", async () => {
    await createUser("maker", 10_000);
    await createUser("post-only", 10_000);
    await placeOrder(limitOrder("maker", "short", 105, 5));

    const response = await placeOrder(
      limitOrder("post-only", "long", 110, 5, { postOnly: true }),
    );

    expect(response.status).toBe("rejected");
    expect(response.fills).toEqual([]);
    expect(response.reason).toMatch(/post.?only/i);

    const book = await getOrderBook();
    expect(book.asks).toHaveLength(1);
    expect(book.bids).toHaveLength(0);
  });
});

describe("Perpetual CEX HTTP contract: order margin edge cases", () => {
  it("fills the affordable higher-price partial match, releases unused margin, and cancels market remainder", async () => {
    await createUser("maker", 10_000);
    await createUser("taker", 1_000);
    await placeOrder(limitOrder("maker", "long", 105, 5));

    const response = await placeOrder(marketOrder("taker", "short", 10, { price: 100 }));

    expect(response.status).toBe("partially_filled");
    expect(response.fills).toHaveLength(1);
    expectMoney(response.fills[0]?.price ?? 0, 105);
    expectMoney(response.fills[0]?.quantity ?? 0, 5);
    expectMoney(response.margin.locked, 1_000);
    expectMoney(response.margin.used, 525);
    expectMoney(response.margin.released, 475);
    expectMoney(response.cancelledQuantity, 5);

    const positions = await getPositions("taker");
    expectSinglePosition(positions, {
      symbol: SYMBOL,
      side: "short",
      quantity: 5,
      averageEntryPrice: 105,
      margin: 525,
    });

    const balance = await getBalance("taker");
    expectMoney(balance.availableBalance, 475);
  });

  it("rejects the higher-price partial-fill scenario when the initial balance cannot lock the submitted notional", async () => {
    await createUser("maker", 10_000);
    await createUser("taker-500", 500);
    await createUser("taker-525", 525);
    await placeOrder(limitOrder("maker", "long", 105, 10));

    const balance500 = await placeOrder(marketOrder("taker-500", "short", 10, { price: 100 }));
    const balance525 = await placeOrder(marketOrder("taker-525", "short", 10, { price: 100 }));

    expect(balance500.status).toBe("rejected");
    expect(balance525.status).toBe("rejected");
    expect(balance500.fills).toEqual([]);
    expect(balance525.fills).toEqual([]);
    expect(balance500.reason).toMatch(/margin/i);
    expect(balance525.reason).toMatch(/margin/i);
  });

  it("releases excess margin when the actual maker price is better than the submitted price", async () => {
    await createUser("maker", 10_000);
    await createUser("taker", 1_000);
    await placeOrder(limitOrder("maker", "long", 99, 5));

    const response = await placeOrder(marketOrder("taker", "short", 10, { price: 100 }));

    expect(response.status).toBe("partially_filled");
    expectMoney(response.fills[0]?.price ?? 0, 99);
    expectMoney(response.margin.locked, 1_000);
    expectMoney(response.margin.used, 495);
    expectMoney(response.margin.released, 505);
    expectMoney(response.cancelledQuantity, 5);
  });

  it("rejects a full fill when the actual higher maker price requires more margin than the user has", async () => {
    await createUser("maker", 10_000);
    await createUser("taker", 1_000);
    await placeOrder(limitOrder("maker", "long", 105, 10));

    const response = await placeOrder(marketOrder("taker", "short", 10, { price: 100 }));

    expect(response.status).toBe("rejected");
    expect(response.fills).toEqual([]);
    expectMoney(response.cancelledQuantity, 10);
    expect(response.reason).toMatch(/margin/i);

    const balance = await getBalance("taker");
    expectMoney(balance.availableBalance, 1_000);

    const book = await getOrderBook();
    expect(book.bids).toHaveLength(1);
    expectMoney(book.bids[0]?.quantity ?? 0, 10);
  });

  it("allows a full fill at a higher maker price when the user has the exact actual margin", async () => {
    await createUser("maker", 10_000);
    await createUser("taker", 1_050);
    await placeOrder(limitOrder("maker", "long", 105, 10));

    const response = await placeOrder(marketOrder("taker", "short", 10, { price: 100 }));

    expect(response.status).toBe("filled");
    expectMoney(response.margin.locked, 1_000);
    expectMoney(response.margin.used, 1_050);
    expectMoney(response.margin.released, 0);
    expectMoney(response.cancelledQuantity, 0);

    const balance = await getBalance("taker");
    expectMoney(balance.availableBalance, 0);
  });
});

describe("Perpetual CEX HTTP contract: margin, funding, liquidation, insurance, and ADL", () => {
  it("locks margin according to leverage for resting orders", async () => {
    await createUser("one-x", 1_000);
    await createUser("ten-x", 1_000);
    await createUser("hundred-x", 1_000);

    const oneX = await placeOrder(limitOrder("one-x", "long", 100, 10, { leverage: 1 }));
    const tenX = await placeOrder(limitOrder("ten-x", "long", 100, 10, { leverage: 10 }));
    const hundredX = await placeOrder(
      limitOrder("hundred-x", "long", 100, 10, { leverage: 100 }),
    );

    expectMoney(oneX.margin.locked, 1_000);
    expectMoney(tenX.margin.locked, 100);
    expectMoney(hundredX.margin.locked, 10);
  });

  it("opens long and short positions and calculates long and short PnL from mark price", async () => {
    await seedMatchedPosition("short-maker", "long-taker", 100, 10, 10);

    const markResponse = await updateMarkPrice(105);
    expect(markResponse.liquidations).toEqual([]);

    const longPosition = expectSinglePosition(await getPositions("long-taker"), {
      symbol: SYMBOL,
      side: "long",
      quantity: 10,
      averageEntryPrice: 100,
      margin: 100,
    });
    const shortPosition = expectSinglePosition(await getPositions("short-maker"), {
      symbol: SYMBOL,
      side: "short",
      quantity: 10,
      averageEntryPrice: 100,
      margin: 100,
    });

    expectMoney(longPosition.unrealizedPnl, 50);
    expectMoney(shortPosition.unrealizedPnl, -50);
    expectMoney(longPosition.liquidationPrice, 100 * (1 - 1 / 10 + MAINTENANCE_MARGIN_RATE));
    expectMoney(shortPosition.liquidationPrice, 100 * (1 + 1 / 10 - MAINTENANCE_MARGIN_RATE));
  });

  it("flips a long position into a short position and realizes PnL on the closed quantity", async () => {
    await seedMatchedPosition("initial-short-maker", "flipper", 100, 10, 10);
    await createUser("bid-maker", 100_000);
    await placeOrder(limitOrder("bid-maker", "long", 110, 15, { leverage: 10 }));

    const response = await placeOrder(marketOrder("flipper", "short", 15, { price: 110, leverage: 10 }));

    expect(response.status).toBe("filled");
    expect(response.fills).toHaveLength(1);
    expectMoney(response.fills[0]?.price ?? 0, 110);
    expectMoney(response.fills[0]?.quantity ?? 0, 15);

    const positions = await getPositions("flipper");
    expectSinglePosition(positions, {
      symbol: SYMBOL,
      side: "short",
      quantity: 5,
      averageEntryPrice: 110,
      margin: 55,
    });

    const balance = await getBalance("flipper");
    expectMoney(balance.realizedPnl, 100);
    expectMoney(balance.availableBalance, 100_045);
    expectMoney(balance.lockedMargin, 0);
  });

  it("applies positive funding so longs pay shorts", async () => {
    await seedMatchedPosition("short-maker", "long-taker", 100, 10);

    const response = await applyFunding(0.0001);

    expect(response).toMatchObject({ symbol: SYMBOL, rate: 0.0001 });
    expect(response.payments).toEqual(
      expect.arrayContaining([
        { userId: "long-taker", side: "long", amount: -0.1 },
        { userId: "short-maker", side: "short", amount: 0.1 },
      ]),
    );

    const longBalance = await getBalance("long-taker");
    const shortBalance = await getBalance("short-maker");
    expectMoney(longBalance.totalEquity, 99_999.9);
    expectMoney(shortBalance.totalEquity, 100_000.1);
  });

  it("applies negative funding so shorts pay longs", async () => {
    await seedMatchedPosition("short-maker", "long-taker", 100, 10);

    const response = await applyFunding(-0.0001);

    expect(response.payments).toEqual(
      expect.arrayContaining([
        { userId: "long-taker", side: "long", amount: 0.1 },
        { userId: "short-maker", side: "short", amount: -0.1 },
      ]),
    );
  });

  it("uses mark price, not last traded price, to trigger liquidation", async () => {
    await seedMatchedPosition("short-maker", "long-taker", 100, 10, 10);

    const safeMark = await updateMarkPrice(95);
    expect(safeMark.liquidations).toEqual([]);

    const liquidationMark = await updateMarkPrice(90.5);
    expect(liquidationMark.liquidations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "long-taker",
          symbol: SYMBOL,
        }),
      ]),
    );
  });

  it("liquidates when funding payment pushes equity below maintenance margin", async () => {
    await createUser("short-maker", 10_000);
    await createUser("fragile-long", 101);
    await placeOrder(limitOrder("short-maker", "short", 100, 10));
    await placeOrder(marketOrder("fragile-long", "long", 10, { price: 100, leverage: 10 }));

    const response = await applyFunding(0.002);

    expect(response.liquidations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "fragile-long",
          symbol: SYMBOL,
        }),
      ]),
    );
  });

  it("sends liquidation excess to the insurance fund", async () => {
    await seedMatchedPosition("short-maker", "long-taker", 100, 10, 5);

    const before = await getInsuranceFund();
    await updateMarkPrice(82);
    const after = await getInsuranceFund();

    expect(after.balance).toBeGreaterThan(before.balance);
  });

  it("triggers ADL events when the insurance fund cannot cover bankrupt liquidation losses", async () => {
    await seedMatchedPosition("profitable-short", "losing-long", 100, 10, 20);

    await updateMarkPrice(60);

    const adlEvents = await getAdlEvents();
    expect(adlEvents.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "profitable-short",
          symbol: SYMBOL,
        }),
      ]),
    );
  });
});