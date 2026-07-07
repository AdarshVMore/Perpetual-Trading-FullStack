import type { PublicTrade, TradableSymbol, TradesCreatedData, WireTrade } from "../types";

export const MAX_PUBLIC_TRADES = 100;

type SyncState = "syncing" | "live";

export function parseFillSeq(fillId: string, marketSymbol: TradableSymbol): number {
  const suffix = fillId.slice(marketSymbol.length);
  const seq = parseInt(suffix, 10);
  return Number.isNaN(seq) ? -1 : seq;
}

export function getLatestTradePrice(
  trades: Pick<WireTrade, "fillId" | "price">[],
  marketSymbol: TradableSymbol,
): number | null {
  if (trades.length === 0) return null;
  let latest = trades[0];
  let latestSeq = parseFillSeq(latest.fillId, marketSymbol);
  for (let i = 1; i < trades.length; i++) {
    const seq = parseFillSeq(trades[i].fillId, marketSymbol);
    if (seq > latestSeq) {
      latest = trades[i];
      latestSeq = seq;
    }
  }
  return latest.price;
}

function recomputeUp(trades: PublicTrade[]): PublicTrade[] {
  if (trades.length === 0) return trades;
  const result = trades.map((trade) => ({ ...trade }));
  for (let i = 0; i < result.length - 1; i++) {
    result[i] = {
      ...result[i],
      up: result[i].price >= result[i + 1].price,
    };
  }
  return result;
}

function toPublicTrade(trade: WireTrade): PublicTrade {
  return {
    fillId: trade.fillId,
    price: trade.price,
    qty: trade.qty,
    time: Date.now(),
    up: true,
  };
}

/**
 * Keeps a single market's public trade tape in sync.
 *
 * Flow (mirrors orderbook / personal fill sequencing):
 *   1. Subscribe to `trades.created` first, buffering every batch.
 *   2. Fetch the latest fills snapshot from the backend.
 *   3. Discard buffered trades at/before the snapshot watermark, replay the
 *      rest in fill-sequence order, then apply live trades only when
 *      fillSeq > lastAppliedFillSeq.
 */
export class TradesSync {
  private state: SyncState = "syncing";
  private buffer: TradesCreatedData[] = [];
  private lastAppliedFillSeq = -1;
  private trades: PublicTrade[] = [];
  private marketSymbol: TradableSymbol;

  constructor(marketSymbol: TradableSymbol) {
    this.marketSymbol = marketSymbol;
  }

  onTradesCreated(data: TradesCreatedData): void {
    if (data.marketSymbol !== this.marketSymbol) return;
    if (this.state === "syncing") {
      this.buffer.push(data);
      return;
    }
    this.applyTrades(data.trades);
  }

  applySnapshot(snapshot: PublicTrade[]): void {
    this.trades = recomputeUp(snapshot);
    this.lastAppliedFillSeq = snapshot.reduce(
      (max, trade) =>
        Math.max(max, parseFillSeq(trade.fillId, this.marketSymbol)),
      -1,
    );

    const pending = this.collectPendingTrades(this.lastAppliedFillSeq);
    for (const trade of pending) this.applyTrade(trade);

    this.buffer = [];
    this.state = "live";
  }

  getTrades(): PublicTrade[] {
    return this.trades;
  }

  private collectPendingTrades(thresholdSeq: number): WireTrade[] {
    const pending: WireTrade[] = [];
    for (const event of this.buffer) {
      for (const trade of event.trades) {
        if (parseFillSeq(trade.fillId, this.marketSymbol) > thresholdSeq) {
          pending.push(trade);
        }
      }
    }
    return pending.sort(
      (a, b) =>
        parseFillSeq(a.fillId, this.marketSymbol) -
        parseFillSeq(b.fillId, this.marketSymbol),
    );
  }

  private applyTrades(trades: WireTrade[]): void {
    for (const trade of trades) this.applyTrade(trade);
  }

  private applyTrade(trade: WireTrade): void {
    const seq = parseFillSeq(trade.fillId, this.marketSymbol);
    if (seq <= this.lastAppliedFillSeq) return;
    this.lastAppliedFillSeq = seq;
    this.trades = recomputeUp([
      toPublicTrade(trade),
      ...this.trades,
    ]).slice(0, MAX_PUBLIC_TRADES);
  }

  /** Live trade from apps/ws — uses timestamp-based fillId. */
  onLiveTrade(trade: {
    fillId: string;
    price: number;
    qty: number;
    time: number;
  }): void {
    const publicTrade: PublicTrade = {
      fillId: trade.fillId,
      price: trade.price,
      qty: trade.qty,
      time: trade.time,
      up: true,
    };
    this.trades = recomputeUp([publicTrade, ...this.trades]).slice(
      0,
      MAX_PUBLIC_TRADES,
    );
    this.state = "live";
  }
}
