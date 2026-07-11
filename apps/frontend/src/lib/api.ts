import { API_URL } from "./constants";
import {
  mapBackendFill,
  mapBackendOrder,
  mapBackendPosition,
  toEmail,
} from "./mappers";
import { toMarketId } from "./markets";
import type { OrderType, PositionType, Side, TradableSymbol } from "./types";
import type {
  ApiCandleTimeframe,
  DbCandleRow,
} from "./sync/candlesSync";
import { getCandleFetchLimit } from "./sync/candlesSync";
import type { ChartTimeframe } from "./sync/candlesSync";

export interface OpenOrder {
  orderId: string;
  side: Side;
  type: OrderType;
  price: number;
  quantity: number;
  filledQuantity: number;
  status: import("./types").OrderStatus;
  marginType: import("./types").MarginType;
  marketSymbol: TradableSymbol;
  leverage: number;
}

export interface HistoricalFill {
  fillId: string;
  marketSymbol: TradableSymbol;
  price: number;
  qty: number;
  side: Side;
  time: number;
}

interface AuthResponse {
  message: string;
  token?: string;
  userId?: string;
}

interface BalanceResponse {
  availableBalance: number;
  lockedBalance: number;
}

interface BackendOrder {
  id: string;
  marketId: string;
  positionType: PositionType;
  orderType: OrderType;
  price: number | null;
  qty: number;
  remainingQty: number;
  leverage: number;
  orderStatus: string;
}

interface BackendPosition {
  id: string;
  marketId: string;
  positionType: PositionType;
  qty: number;
  entryPrice: number;
  margin: number;
  liquidationPrice: number;
}

interface BackendFill {
  id: string;
  marketId: string;
  orderId: string;
  price: number;
  filledQty: number;
  createdAt: string;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;
    return "Request failed";
  } catch {
    return "Request failed";
  }
}

async function authFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export interface SimBotRecord {
  userId: string;
  username: string;
}

export async function fetchSimBots(
  prefix = "sim-bot",
): Promise<SimBotRecord[]> {
  const res = await fetch(
    `${API_URL}/auth/sim-bots?prefix=${encodeURIComponent(prefix)}`,
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { bots?: SimBotRecord[] };
  return body.bots ?? [];
}

export async function signIn(
  username: string,
  password: string,
): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${API_URL}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: toEmail(username), password }),
  });
  const data = (await res.json()) as AuthResponse;
  if (!res.ok || !data.token || !data.userId) {
    throw new Error(data.message ?? "Incorrect credentials");
  }
  return { token: data.token, userId: data.userId };
}

export async function signUp(
  username: string,
  password: string,
): Promise<"created" | "exists"> {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: toEmail(username),
      password,
      role: "user",
    }),
  });
  const data = (await res.json()) as AuthResponse;
  if (!res.ok) throw new Error(data.message ?? "Signup failed");
  if (data.message === "user already exists") {
    return "exists";
  }
  return "created";
}

export interface DemoUserSnapshot {
  userId: string;
  username: string;
  availableBalance: number;
  lockedBalance: number;
  openPositions: number;
  openOrders: number;
  positions: {
    marketId: string;
    qty: number;
    positionType: string;
    entryPrice: number;
  }[];
}

export async function fetchDemoUserSnapshots(): Promise<DemoUserSnapshot[]> {
  const res = await fetch(`${API_URL}/auth/demo-users`);
  if (!res.ok) return [];
  const body = (await res.json()) as { users: DemoUserSnapshot[] };
  return body.users ?? [];
}

export async function ensureDemoAccounts(
  accounts: { username: string; password: string }[],
): Promise<void> {
  await Promise.all(
    accounts.map(async (account) => {
      try {
        await signUp(account.username, account.password);
      } catch {
        // Seeded or already exists.
      }
    }),
  );
}

export async function fetchBalance(
  token: string,
): Promise<{ available: number; locked: number }> {
  const data = await authFetch<BalanceResponse>(`/auth/balance`, token);
  return {
    available: data.availableBalance,
    locked: data.lockedBalance,
  };
}

export async function addBalanceApi(
  token: string,
  amount: number,
): Promise<{ available: number; locked: number }> {
  const data = await authFetch<BalanceResponse>(`/auth/add-balance`, token, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
  return {
    available: data.availableBalance,
    locked: data.lockedBalance,
  };
}

export async function createOrderApi(
  token: string,
  params: {
    marketSymbol: TradableSymbol;
    side: Side;
    type: OrderType;
    price: number;
    qty: number;
    leverage: number;
  },
): Promise<{ orderId: string }> {
  const data = await authFetch<{ orderId: string; message: string }>(
    `/order/create-order`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        marketId: toMarketId(params.marketSymbol),
        price: params.type === "MARKET" ? 0 : params.price,
        qty: params.qty,
        leverage: params.leverage,
        orderType: params.type,
        positionType: params.side === "BUY" ? "LONG" : "SHORT",
      }),
    },
  );
  return { orderId: data.orderId };
}

export async function cancelOrderApi(
  token: string,
  order: OpenOrder,
  leverage: number,
): Promise<void> {
  await authFetch<{ message: string }>(
    `/order/cancle-order/${order.orderId}`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        marketId: toMarketId(order.marketSymbol),
        price: order.price,
        positionType: order.side === "BUY" ? "LONG" : "SHORT",
        qty: order.quantity - order.filledQuantity,
        leverage,
        orderType: order.type,
      }),
    },
  );
}

export async function fetchOpenOrders(
  token: string,
  marketSymbol: TradableSymbol,
): Promise<OpenOrder[]> {
  const data = await authFetch<{ orders: BackendOrder[] }>(
    `/order/get-orders/${toMarketId(marketSymbol)}`,
    token,
  );
  return data.orders
    .map(mapBackendOrder)
    .filter((o): o is OpenOrder => o != null);
}

export async function fetchPositions(
  token: string,
  marketSymbol: TradableSymbol,
): Promise<import("./types").UiPosition[]> {
  const data = await authFetch<{ positions: BackendPosition[] }>(
    `/order/get-positions/${toMarketId(marketSymbol)}`,
    token,
  );
  return data.positions
    .map(mapBackendPosition)
    .filter((p): p is import("./types").UiPosition => p != null);
}

export async function fetchAllPositions(
  token: string,
): Promise<import("./types").UiPosition[]> {
  const symbols: TradableSymbol[] = ["BTCUSD", "ETHUSD", "SOLUSD"];
  const results = await Promise.all(
    symbols.map((s) => fetchPositions(token, s).catch(() => [])),
  );
  return results.flat();
}

export async function fetchFills(
  token: string,
  marketSymbol: TradableSymbol,
): Promise<HistoricalFill[]> {
  const data = await authFetch<{ fills: BackendFill[] }>(
    `/order/get-fills/${toMarketId(marketSymbol)}`,
    token,
  );
  const orders = await fetchOpenOrders(token, marketSymbol).catch(() => []);
  const orderSideById = new Map(
    orders.map((o) => [o.orderId, o.side] as const),
  );

  return data.fills
    .map((f) => {
      const fill = mapBackendFill(f, orderSideById.get(f.orderId));
      if (!fill) return null;
      return {
        fillId: fill.fillId,
        marketSymbol: fill.marketSymbol,
        price: fill.price,
        qty: fill.qty,
        side: fill.side,
        time: fill.time,
      };
    })
    .filter((f): f is HistoricalFill => f != null)
    .sort((a, b) => b.time - a.time);
}

export async function fetchAllFills(
  token: string,
): Promise<HistoricalFill[]> {
  const symbols: TradableSymbol[] = ["BTCUSD", "ETHUSD", "SOLUSD"];
  const results = await Promise.all(
    symbols.map((s) => fetchFills(token, s).catch(() => [])),
  );
  return results.flat().sort((a, b) => b.time - a.time);
}

export interface MarketTrade {
  fillId: string;
  price: number;
  qty: number;
  time: number;
  up: boolean;
}

interface MarketFillRow {
  id: string;
  price: number;
  filledQty: number;
  createdAt: string;
}

function withTradeDirection(
  trades: Omit<MarketTrade, "up">[],
): MarketTrade[] {
  const result = trades.map((trade) => ({ ...trade, up: true }));
  for (let i = 0; i < result.length - 1; i++) {
    result[i] = {
      ...result[i],
      up: result[i].price >= result[i + 1].price,
    };
  }
  return result;
}

/** Timescale continuous-aggregate OHLC rows for a market. */
export async function fetchCandles(
  marketSymbol: TradableSymbol,
  timeframe: ApiCandleTimeframe,
  limit = 90,
): Promise<DbCandleRow[]> {
  const data = await fetch(
    `${API_URL}/order/get-candles/${toMarketId(marketSymbol)}?timeframe=${timeframe}&limit=${limit}`,
  );
  if (!data.ok) {
    return [];
  }
  const body = (await data.json()) as { candles: DbCandleRow[] };
  return body.candles ?? [];
}

/** Load enough fills to bootstrap or re-aggregate chart candles client-side. */
export async function fetchFillsForCandles(
  marketSymbol: TradableSymbol,
  chartTimeframe: ChartTimeframe,
): Promise<Omit<MarketTrade, "up">[]> {
  const limit = Math.max(getCandleFetchLimit(chartTimeframe) * 20, 500);
  return fetchMarketFills(marketSymbol, limit);
}

/** Public market trade tape from the fills hypertable. */
export async function fetchMarketFills(
  marketSymbol: TradableSymbol,
  limit = 500,
): Promise<Omit<MarketTrade, "up">[]> {
  const data = await fetch(
    `${API_URL}/order/get-market-fills/${toMarketId(marketSymbol)}?limit=${limit}`,
  );
  if (!data.ok) {
    throw new Error(await parseError(data));
  }
  const body = (await data.json()) as { fills: MarketFillRow[] };
  return body.fills
    .map((fill) => ({
      fillId: fill.id,
      price: fill.price,
      qty: fill.filledQty,
      time: new Date(fill.createdAt).getTime(),
    }))
    .sort((a, b) => b.time - a.time);
}

/** Public trade tape for the order-book ticker and chart bootstrap. */
export async function fetchMarketTrades(
  marketSymbol: TradableSymbol,
  limit = 100,
): Promise<MarketTrade[]> {
  const fills = await fetchMarketFills(marketSymbol, limit);
  return withTradeDirection(fills);
}
