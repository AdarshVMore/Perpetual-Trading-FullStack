import {
  addBalanceApi,
  createOrderApi,
  fetchOpenOrders,
  signIn,
  signUp,
} from "../api";
import { API_URL, getMarket, resolveReferencePrice } from "../constants";
import type { OrderType, Side, TradableSymbol } from "../types";

export interface LoadTestConfig {
  userCount: number;
  /** How many random orders each user places */
  decisionsPerUser: number;
  /** Random pause between a user's orders [min, max] ms */
  delayMs: [number, number];
  marketSymbol: TradableSymbol;
  price: number;
  /** Random order size range [min, max] */
  qtyRange: [number, number];
  leverage: number;
  usernamePrefix: string;
  password: string;
}

export interface LoadTestTimings {
  setupMs: number;
  buyOrderLatenciesMs: number[];
  sellOrderLatenciesMs: number[];
  firstOrderAt: number;
  lastOrderAt: number;
}

export interface LoadTestResult {
  ok: boolean;
  error?: string;
  users: string[];
  ordersSubmitted: number;
  bidsPlaced: number;
  asksPlaced: number;
  openOrdersInDb: number;
  timings: LoadTestTimings;
  summary: {
    buyAvgMs: number;
    buyP99Ms: number;
    sellAvgMs: number;
    sellP99Ms: number;
    placementSpanMs: number;
    ordersPerSec: number;
  };
}

type LogFn = (line: string) => void;

class LoadTestClient {
  token: string;

  constructor(token: string) {
    this.token = token;
  }

  async addBalance(amount: number): Promise<void> {
    await addBalanceApi(this.token, amount);
  }

  async createOrder(params: {
    side: Side;
    type: OrderType;
    price: number;
    qty: number;
    leverage: number;
    marketSymbol: TradableSymbol;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      await createOrderApi(this.token, params);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function resolveTradePrice(
  marketSymbol: TradableSymbol,
  hintPrice: number,
  log: LogFn,
): number {
  if (hintPrice > 0) {
    log(`Using configured price $${hintPrice}`);
    return hintPrice;
  }
  const fallback = resolveReferencePrice(marketSymbol);
  log(`Using reference price $${fallback} for ${marketSymbol}`);
  return fallback;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[idx];
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Demo balance — effectively unlimited for load testing. */
const DEMO_USER_BALANCE = 100_000_000;

function randomDelayMs(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomSide(): Side {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return n % 2 === 0 ? "BUY" : "SELL";
}

/** Side first, then price — mostly rests on the correct side of mid, sometimes crosses for fills. */
function randomPriceForSide(
  side: Side,
  mid: number,
  pricePrecision: number,
): number {
  const pct = 0.002 + Math.random() * 0.028;
  const cross = Math.random() < 0.35;
  if (side === "BUY") {
    const mult = cross ? 1 + pct : 1 - pct;
    return parseFloat((mid * mult).toFixed(pricePrecision));
  }
  const mult = cross ? 1 - pct : 1 + pct;
  return parseFloat((mid * mult).toFixed(pricePrecision));
}

function randomQty(min: number, max: number, qtyPrecision: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const raw = lo + Math.random() * (hi - lo);
  return parseFloat(raw.toFixed(qtyPrecision));
}

async function ensureUser(
  username: string,
  password: string,
): Promise<string> {
  try {
    await signUp(username, password);
  } catch {
    // already exists
  }
  const { token } = await signIn(username, password);
  return token;
}

function emptyResult(error: string, setupMs = 0): LoadTestResult {
  return {
    ok: false,
    error,
    users: [],
    ordersSubmitted: 0,
    bidsPlaced: 0,
    asksPlaced: 0,
    openOrdersInDb: 0,
    timings: {
      setupMs,
      buyOrderLatenciesMs: [],
      sellOrderLatenciesMs: [],
      firstOrderAt: 0,
      lastOrderAt: 0,
    },
    summary: {
      buyAvgMs: 0,
      buyP99Ms: 0,
      sellAvgMs: 0,
      sellP99Ms: 0,
      placementSpanMs: 0,
      ordersPerSec: 0,
    },
  };
}

export async function runLoadTest(
  config: LoadTestConfig,
  log: LogFn = console.log,
): Promise<LoadTestResult> {
  const {
    userCount,
    decisionsPerUser,
    delayMs,
    marketSymbol,
    price: configuredPrice,
    qtyRange,
    usernamePrefix,
    password,
    leverage,
  } = config;

  const [delayMin, delayMax] = delayMs;
  const [qtyMin, qtyMax] = qtyRange;
  const { pricePrecision, qtyPrecision } = getMarket(marketSymbol);
  const totalTarget = userCount * decisionsPerUser;

  if (userCount < 1) return emptyResult("userCount must be >= 1");
  if (decisionsPerUser < 1) return emptyResult("decisionsPerUser must be >= 1");
  if (qtyMin <= 0 || qtyMax <= 0) return emptyResult("qty range must be > 0");

  const setupStart = performance.now();

  log(`API: ${API_URL}`);
  log(
    `${userCount} users × ${decisionsPerUser} random orders on ${marketSymbol} ` +
      `(qty ${Math.min(qtyMin, qtyMax)}–${Math.max(qtyMin, qtyMax)}, ` +
      `delay ${delayMin}–${delayMax}ms)`,
  );

  const usernames = Array.from(
    { length: userCount },
    (_, i) => `${usernamePrefix}-${Date.now()}-${i}`,
  );
  const clients: LoadTestClient[] = [];

  const buyLatencies: number[] = [];
  const sellLatencies: number[] = [];
  let firstOrderAt = 0;
  let lastOrderAt = 0;
  let ordersSubmitted = 0;
  let bidsPlaced = 0;
  let asksPlaced = 0;

  const recordOrder = (side: Side, ms: number, t0: number, ok: boolean) => {
    if (!ok) return;
    if (side === "BUY") {
      buyLatencies.push(ms);
      bidsPlaced++;
    } else {
      sellLatencies.push(ms);
      asksPlaced++;
    }
    ordersSubmitted++;
    if (firstOrderAt === 0) firstOrderAt = t0;
    lastOrderAt = performance.now();
  };

  try {
    log("Creating users...");
    for (const username of usernames) {
      const token = await ensureUser(username, password);
      const client = new LoadTestClient(token);
      clients.push(client);
      await client.addBalance(DEMO_USER_BALANCE);
    }

    const mid = resolveTradePrice(marketSymbol, configuredPrice, log);

    const setupMs = performance.now() - setupStart;
    log(`Setup done in ${setupMs.toFixed(0)}ms — placing ${totalTarget} orders...`);
    log(`Each user funded with $${DEMO_USER_BALANCE.toLocaleString()} — generous margin per order`);

    await Promise.all(
      usernames.map(async (username, userIdx) => {
        const client = clients[userIdx]!;

        for (let d = 0; d < decisionsPerUser; d++) {
          const side = randomSide();
          const price = randomPriceForSide(side, mid, pricePrecision);
          const qty = randomQty(qtyMin, qtyMax, qtyPrecision);
          const t0 = performance.now();

          const res = await client.createOrder({
            side,
            type: "LIMIT",
            price,
            qty,
            leverage,
            marketSymbol,
          });

          const ms = performance.now() - t0;
          const ok = res.ok;
          recordOrder(side, ms, t0, ok);

          const label = side === "BUY" ? "bid" : "ask";
          if (ok) {
            log(`  ${username}: ${label} ${qty} @ $${price} (${d + 1}/${decisionsPerUser})`);
          } else {
            log(`  ${username}: SKIP ${label} ${qty} @ $${price}: ${res.error}`);
          }

          if (d < decisionsPerUser - 1) {
            await sleep(randomDelayMs(delayMin, delayMax));
          }
        }
      }),
    );

    const placementSpanMs = lastOrderAt - (firstOrderAt || lastOrderAt);
    const ordersPerSec =
      placementSpanMs > 0 ? ordersSubmitted / (placementSpanMs / 1000) : 0;

    const probeToken = await ensureUser(usernames[0]!, password);
    let openOrdersInDb = 0;
    try {
      await sleep(500);
      openOrdersInDb = (await fetchOpenOrders(probeToken, marketSymbol)).length;
      log(`Open orders in DB (probe user): ${openOrdersInDb}`);
    } catch {
      log("Could not fetch open orders from REST");
    }

    const summary = {
      buyAvgMs: avg(buyLatencies),
      buyP99Ms: percentile(buyLatencies, 99),
      sellAvgMs: avg(sellLatencies),
      sellP99Ms: percentile(sellLatencies, 99),
      placementSpanMs,
      ordersPerSec,
    };

    log("");
    log("=== Results ===");
    log(`Orders submitted:  ${ordersSubmitted} / ${totalTarget}`);
    log(`Bids:              ${bidsPlaced}`);
    log(`Asks:              ${asksPlaced}`);
    log(`BUY  avg/p99:      ${summary.buyAvgMs.toFixed(1)} / ${summary.buyP99Ms.toFixed(1)} ms`);
    log(`SELL avg/p99:      ${summary.sellAvgMs.toFixed(1)} / ${summary.sellP99Ms.toFixed(1)} ms`);
    log(`Span:              ${summary.placementSpanMs.toFixed(0)} ms`);

    const ok = ordersSubmitted >= totalTarget * 0.85;

    return {
      ok,
      users: usernames,
      ordersSubmitted,
      bidsPlaced,
      asksPlaced,
      openOrdersInDb,
      timings: {
        setupMs,
        buyOrderLatenciesMs: buyLatencies,
        sellOrderLatenciesMs: sellLatencies,
        firstOrderAt,
        lastOrderAt,
      },
      summary,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`ERROR: ${message}`);
    return {
      ...emptyResult(message, performance.now() - setupStart),
      users: usernames,
      ordersSubmitted,
      bidsPlaced,
      asksPlaced,
    };
  } finally {
    // REST clients — nothing to close
    void clients;
  }
}

export const DEFAULT_LOAD_TEST_CONFIG: LoadTestConfig = {
  userCount: 4,
  decisionsPerUser: 100,
  delayMs: [0, 1_000],
  marketSymbol: "SOLUSD",
  price: 0,
  qtyRange: [1, 10],
  leverage: 10,
  usernamePrefix: "loadtest",
  password: "loadtest-pass",
};
