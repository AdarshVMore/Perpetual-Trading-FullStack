import {
  addBalanceApi,
  cancelOrderApi,
  createOrderApi,
  fetchOpenOrders,
  signIn,
  signUp,
  type OpenOrder,
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

async function ensureBot(
  username: string,
  password: string,
): Promise<SimBot> {
  try {
    await signUp(username, password);
  } catch {
    // already exists
  }
  const { token } = await signIn(username, password);
  return { username, token };
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
      this.bots = [];
      const stamp = Date.now();
      for (let i = 0; i < config.botCount; i++) {
        if (this.abort) return;
        const username = `${config.usernamePrefix}-${stamp}-${i}`;
        const bot = await ensureBot(username, config.password);
        await addBalanceApi(bot.token, BOT_BALANCE);
        this.bots.push(bot);
        onLog(`  Bot ready: ${username}`);
      }

      onLog("Simulation loop running…");

      while (!this.abort) {
        const bot = pick(this.bots);
        const market = pick(config.markets);
        const { pricePrecision, qtyPrecision } = getMarket(market);

        const mid = resolvePrice(market) ?? resolveReferencePrice(market);

        const roll = Math.random();

        if (roll < config.cancelProbability) {
          await this.tryCancel(bot, market, onLog);
        } else {
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
            await createOrderApi(bot.token, {
              marketSymbol: market,
              side,
              type: "LIMIT",
              price,
              qty,
              leverage: config.leverage,
            });
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
        }

        await sleep(randomInt(config.intervalMs[0], config.intervalMs[1]));
      }
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
  ): Promise<void> {
    try {
      const orders = await fetchOpenOrders(bot.token, market);
      const resting = orders.filter(
        (o) => o.status === "OPEN" || o.status === "PARTIALLY_FILLED",
      );
      if (resting.length === 0) return;

      const order = pick(resting) as OpenOrder;
      await cancelOrderApi(bot.token, order, order.leverage);
      this.stats.ordersCancelled++;
      onLog(
        `[${market}] ${bot.username}: CANCEL ${order.side} ${order.quantity - order.filledQuantity} @ ${order.price}`,
      );
    } catch (err) {
      this.stats.errors++;
      onLog(
        `ERR cancel ${bot.username}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

let activeSimulator: MarketSimulator | null = null;

export function getMarketSimulator(): MarketSimulator {
  if (!activeSimulator) activeSimulator = new MarketSimulator();
  return activeSimulator;
}
