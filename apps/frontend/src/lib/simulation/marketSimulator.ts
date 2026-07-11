import {
  addBalanceApi,
  cancelOrderApi,
  createOrderApi,
  fetchBalance,
  fetchOpenOrders,
  fetchSimBots,
  signIn,
  signUp,
  type OpenOrder,
  type SimBotRecord,
} from "../api";
import { getMarket, resolveReferencePrice } from "../constants";
import type { Side, TradableSymbol } from "../types";

export interface MarketSimulatorConfig {
  botCount: number;
  markets: TradableSymbol[];
  intervalMs: [number, number];
  spreadPct: number;
  /** Chance a limit order crosses the spread and fills against resting liquidity. */
  crossProbability: number;
  cancelProbability: number;
  qtyRange: [number, number];
  leverage: number;
  usernamePrefix: string;
  password: string;
}

export interface SimulatorStats {
  ordersPlaced: number;
  bidsPlaced: number;
  asksPlaced: number;
  ordersCancelled: number;
  errors: number;
  startedAt: number;
}

export type PriceResolver = (symbol: TradableSymbol) => number | null;
export type LogFn = (line: string) => void;

export const DEFAULT_SIMULATOR_CONFIG: MarketSimulatorConfig = {
  botCount: 8,
  markets: ["SOLUSD", "BTCUSD", "ETHUSD"],
  intervalMs: [200, 1200],
  spreadPct: 0.012,
  crossProbability: 0.3,
  cancelProbability: 0.2,
  qtyRange: [0.5, 8],
  leverage: 10,
  usernamePrefix: "sim-bot",
  password: "sim-bot-pass",
};

const BOT_BALANCE = 50_000_000;
const MIN_BOT_BALANCE = 1_000_000;
const API_TIMEOUT_MS = 20_000;

interface SimBot {
  username: string;
  token: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function simBotIndex(username: string, prefix: string): number | null {
  const match = username.match(
    new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`),
  );
  if (!match) return null;
  return Number.parseInt(match[1]!, 10);
}

function sortSimBots(bots: SimBotRecord[], prefix: string): SimBotRecord[] {
  return [...bots].sort((a, b) => {
    const aIndex = simBotIndex(a.username, prefix);
    const bIndex = simBotIndex(b.username, prefix);
    if (aIndex != null && bIndex != null) return aIndex - bIndex;
    if (aIndex != null) return -1;
    if (bIndex != null) return 1;
    return a.username.localeCompare(b.username);
  });
}

function nextSimBotIndex(existing: SimBotRecord[], prefix: string): number {
  let maxIndex = -1;
  for (const bot of existing) {
    const index = simBotIndex(bot.username, prefix);
    if (index != null) maxIndex = Math.max(maxIndex, index);
  }
  return maxIndex + 1;
}

async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms = API_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function ensureBot(
  username: string,
  password: string,
): Promise<SimBot> {
  try {
    await withTimeout(signUp(username, password), `signUp(${username})`);
  } catch {
    // already exists or transient signup error — sign-in below validates access
  }
  const { token } = await withTimeout(
    signIn(username, password),
    `signIn(${username})`,
  );
  return { username, token };
}

async function ensureBotBalance(bot: SimBot, onLog: LogFn): Promise<void> {
  try {
    const balance = await withTimeout(
      fetchBalance(bot.token),
      `fetchBalance(${bot.username})`,
    );
    if (balance.available >= MIN_BOT_BALANCE) return;
  } catch {
    // fall through to top-up
  }

  await withTimeout(
    addBalanceApi(bot.token, BOT_BALANCE),
    `addBalance(${bot.username})`,
  );
  onLog(`  Topped up balance for ${bot.username}`);
}

async function provisionBots(
  config: MarketSimulatorConfig,
  onLog: LogFn,
): Promise<SimBot[]> {
  const existing = sortSimBots(
    await fetchSimBots(config.usernamePrefix),
    config.usernamePrefix,
  );
  const bots: SimBot[] = [];
  const reservedNames = new Set(existing.map((bot) => bot.username));

  const reuse = existing.slice(0, config.botCount);
  if (reuse.length > 0) {
    onLog(`Reusing ${reuse.length} existing bot(s) from database`);
  }

  for (const record of reuse) {
    const bot = await ensureBot(record.username, config.password);
    await ensureBotBalance(bot, onLog);
    bots.push(bot);
    onLog(`  Bot ready: ${record.username} (existing)`);
  }

  const deficit = config.botCount - bots.length;
  if (deficit > 0) {
    onLog(`Creating ${deficit} new bot(s)…`);
    let nextIndex = nextSimBotIndex(existing, config.usernamePrefix);

    for (let i = 0; i < deficit; i++) {
      while (reservedNames.has(`${config.usernamePrefix}-${nextIndex}`)) {
        nextIndex++;
      }
      const username = `${config.usernamePrefix}-${nextIndex}`;
      reservedNames.add(username);
      nextIndex++;

      const bot = await ensureBot(username, config.password);
      await ensureBotBalance(bot, onLog);
      bots.push(bot);
      onLog(`  Bot ready: ${username} (new)`);
    }
  }

  return bots;
}

/** Resting bid below mid or ask above mid; sometimes crosses to generate fills. */
function priceForSide(
  side: Side,
  mid: number,
  spreadPct: number,
  crossProbability: number,
  precision: number,
): number {
  const offset = spreadPct * (0.5 + Math.random());
  const cross = Math.random() < crossProbability;
  if (side === "BUY") {
    const mult = cross ? 1 + offset : 1 - offset;
    return parseFloat((mid * mult).toFixed(precision));
  }
  const mult = cross ? 1 - offset : 1 + offset;
  return parseFloat((mid * mult).toFixed(precision));
}

function randomQty(min: number, max: number, precision: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return parseFloat(randomBetween(lo, hi).toFixed(precision));
}

export class MarketSimulator {
  private running = false;
  private abort = false;
  private bots: SimBot[] = [];
  private stats: SimulatorStats = {
    ordersPlaced: 0,
    bidsPlaced: 0,
    asksPlaced: 0,
    ordersCancelled: 0,
    errors: 0,
    startedAt: 0,
  };

  isRunning(): boolean {
    return this.running;
  }

  getStats(): SimulatorStats {
    return { ...this.stats };
  }

  async start(
    config: MarketSimulatorConfig,
    resolvePrice: PriceResolver,
    onLog: LogFn = () => {},
  ): Promise<void> {
    if (this.running) return;
    if (config.markets.length === 0) {
      onLog("Cannot start: no markets selected");
      return;
    }

    this.running = true;
    this.abort = false;
    this.stats = {
      ordersPlaced: 0,
      bidsPlaced: 0,
      asksPlaced: 0,
      ordersCancelled: 0,
      errors: 0,
      startedAt: Date.now(),
    };

    onLog(`Starting market simulator — ${config.botCount} bots`);

    try {
      this.bots = await provisionBots(config, onLog);
      if (this.bots.length === 0) {
        onLog("No bots available — aborting");
        return;
      }

      onLog(
        `Simulation loop running — ${this.bots.length} bot(s) on ${config.markets.join(", ")}`,
      );

      while (!this.abort) {
        const bot = pick(this.bots);
        const market = pick(config.markets);
        const { pricePrecision, qtyPrecision } = getMarket(market);

        const mid =
          resolvePrice(market) ?? resolveReferencePrice(market);
        if (!Number.isFinite(mid) || mid <= 0) {
          onLog(`Waiting for price on ${market}…`);
          await sleep(500);
          continue;
        }

        const roll = Math.random();
        if (roll < config.cancelProbability) {
          const cancelled = await this.tryCancel(bot, market, onLog);
          if (cancelled) {
            await sleep(randomInt(config.intervalMs[0], config.intervalMs[1]));
            continue;
          }
        }

        const side: Side = Math.random() < 0.5 ? "BUY" : "SELL";
        const price = priceForSide(
          side,
          mid,
          config.spreadPct,
          config.crossProbability,
          pricePrecision,
        );
        const qty = randomQty(
          config.qtyRange[0],
          config.qtyRange[1],
          qtyPrecision,
        );

        try {
          await withTimeout(
            createOrderApi(bot.token, {
              marketSymbol: market,
              side,
              type: "LIMIT",
              price,
              qty,
              leverage: config.leverage,
            }),
            `createOrder(${bot.username})`,
          );
          this.stats.ordersPlaced++;
          if (side === "BUY") this.stats.bidsPlaced++;
          else this.stats.asksPlaced++;
          const tag = side === "BUY" ? "BID" : "ASK";
          onLog(`[${market}] ${bot.username}: ${tag} ${qty} @ ${price}`);
        } catch (err) {
          this.stats.errors++;
          onLog(
            `ERR ${bot.username}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        await sleep(randomInt(config.intervalMs[0], config.intervalMs[1]));
      }
    } catch (err) {
      onLog(
        `Simulator failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
      onLog("Simulator stopped.");
    }
  }

  stop(): void {
    this.abort = true;
  }

  private async tryCancel(
    bot: SimBot,
    market: TradableSymbol,
    onLog: LogFn,
  ): Promise<boolean> {
    try {
      const orders = await withTimeout(
        fetchOpenOrders(bot.token, market),
        `fetchOpenOrders(${bot.username})`,
      );
      const resting = orders.filter(
        (o) => o.status === "OPEN" || o.status === "PARTIALLY_FILLED",
      );
      if (resting.length === 0) return false;

      const order = pick(resting) as OpenOrder;
      await withTimeout(
        cancelOrderApi(bot.token, order, order.leverage),
        `cancelOrder(${bot.username})`,
      );
      this.stats.ordersCancelled++;
      onLog(
        `[${market}] ${bot.username}: CANCEL ${order.side} ${order.quantity - order.filledQuantity} @ ${order.price}`,
      );
      return true;
    } catch (err) {
      this.stats.errors++;
      onLog(
        `ERR cancel ${bot.username}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}

let activeSimulator: MarketSimulator | null = null;

export function getMarketSimulator(): MarketSimulator {
  if (!activeSimulator) activeSimulator = new MarketSimulator();
  return activeSimulator;
}
