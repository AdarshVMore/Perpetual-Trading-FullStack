import type { TradableSymbol, TradesCreatedData, WireTrade } from "../types";
import { parseFillSeq } from "./tradesSync";

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export type ChartTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export type ApiCandleTimeframe = "1min" | "1hour" | "1day";

export const DEFAULT_CHART_TIMEFRAME: ChartTimeframe = "1m";

export interface FillForCandle {
  fillId: string;
  price: number;
  time: number;
}

export interface DbCandleRow {
  bucket: string | Date;
  lastTradeId?: string;
  lasttradeid?: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
}

interface TimeframeConfig {
  apiTimeframe: ApiCandleTimeframe;
  bucketMs: number;
  aggregateFactor: number;
}

export const MAX_CHART_CANDLES = 90;

const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 40;

const TIMEFRAME_CONFIG: Record<ChartTimeframe, TimeframeConfig> = {
  "1m": { apiTimeframe: "1min", bucketMs: 60_000, aggregateFactor: 1 },
  "5m": { apiTimeframe: "1min", bucketMs: 5 * 60_000, aggregateFactor: 5 },
  "15m": { apiTimeframe: "1min", bucketMs: 15 * 60_000, aggregateFactor: 15 },
  "1h": { apiTimeframe: "1hour", bucketMs: 60 * 60_000, aggregateFactor: 1 },
  "4h": { apiTimeframe: "1hour", bucketMs: 4 * 60 * 60_000, aggregateFactor: 4 },
  "1d": { apiTimeframe: "1day", bucketMs: 24 * 60 * 60_000, aggregateFactor: 1 },
};

type SyncState = "syncing" | "live";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : parseFloat(value);
}

function rowLastTradeId(row: DbCandleRow): string | undefined {
  return row.lastTradeId ?? row.lasttradeid;
}

function fromDbRow(row: DbCandleRow): Candle {
  return {
    t: new Date(row.bucket).getTime(),
    o: toNumber(row.open),
    h: toNumber(row.high),
    l: toNumber(row.low),
    c: toNumber(row.close),
  };
}

function aggregateCandles(candles: Candle[], targetBucketMs: number): Candle[] {
  const groups = new Map<number, Candle>();
  for (const c of candles) {
    const bucket = Math.floor(c.t / targetBucketMs) * targetBucketMs;
    const existing = groups.get(bucket);
    if (!existing) {
      groups.set(bucket, { ...c, t: bucket });
      continue;
    }
    groups.set(bucket, {
      t: bucket,
      o: existing.o,
      h: Math.max(existing.h, c.h),
      l: Math.min(existing.l, c.l),
      c: c.c,
    });
  }
  return [...groups.values()].sort((a, b) => a.t - b.t);
}

export function buildCandlesFromFills(
  fills: FillForCandle[],
  bucketMs: number,
): Candle[] {
  const sorted = [...fills].sort(
    (a, b) => a.time - b.time || a.fillId.localeCompare(b.fillId),
  );
  let candles: Candle[] = [];
  for (const fill of sorted) {
    candles = applyTradeToCandles(candles, fill.price, bucketMs, fill.time);
  }
  return candles.slice(-MAX_CHART_CANDLES);
}

function applyTradeToCandles(
  candles: Candle[],
  price: number,
  bucketMs: number,
  time: number,
): Candle[] {
  const bucket = Math.floor(time / bucketMs) * bucketMs;
  const last = candles[candles.length - 1];

  if (!last || bucket > last.t) {
    const open = last?.c ?? price;
    return [...candles, { t: bucket, o: open, h: price, l: price, c: price }];
  }

  if (bucket === last.t) {
    return [
      ...candles.slice(0, -1),
      {
        ...last,
        h: Math.max(last.h, price),
        l: Math.min(last.l, price),
        c: price,
      },
    ];
  }

  return candles;
}

export function getTimeframeConfig(timeframe: ChartTimeframe): TimeframeConfig {
  return TIMEFRAME_CONFIG[timeframe];
}

export function getCandleFetchLimit(timeframe: ChartTimeframe): number {
  const { aggregateFactor } = getTimeframeConfig(timeframe);
  return MAX_CHART_CANDLES * aggregateFactor;
}

function fillsAfterDbWatermark(
  fills: FillForCandle[],
  dbRows: DbCandleRow[],
  bucketMs: number,
): FillForCandle[] {
  if (dbRows.length === 0) return fills;

  const lastDbBucket = Math.max(
    ...dbRows.map((row) => new Date(row.bucket).getTime()),
  );
  // Include the last DB bucket — continuous aggregates can lag the live fill stream.
  return fills.filter((fill) => {
    const fillBucket = Math.floor(fill.time / bucketMs) * bucketMs;
    return fillBucket >= lastDbBucket;
  });
}

/**
 * Keeps chart candles in sync with market fills.
 *
 * Flow:
 *   1. Subscribe to `trades.created` first, buffering every batch.
 *   2. Fetch Timescale continuous-aggregate rows and/or market fills.
 *   3. Poll until the DB snapshot catches the first buffered trade (legacy path).
 *   4. Replay pending trades in fill-sequence order, then apply live trades.
 */
export class CandlesSync {
  private state: SyncState = "syncing";
  private buffer: TradesCreatedData[] = [];
  private lastAppliedFillSeq = -1;
  private seenFillIds = new Set<string>();
  private candles: Candle[] = [];
  private readonly marketSymbol: TradableSymbol;
  private readonly bucketMs: number;
  private readonly aggregateFactor: number;

  constructor(marketSymbol: TradableSymbol, timeframe: ChartTimeframe) {
    this.marketSymbol = marketSymbol;
    const config = getTimeframeConfig(timeframe);
    this.bucketMs = config.bucketMs;
    this.aggregateFactor = config.aggregateFactor;
  }

  onTradesCreated(data: TradesCreatedData): void {
    if (data.marketSymbol !== this.marketSymbol) return;
    if (this.state === "syncing") {
      this.buffer.push(data);
      return;
    }
    this.applyTrades(data.trades);
  }

  async awaitSnapshot(fetchSnapshot: () => Promise<DbCandleRow[]>): Promise<void> {
    const firstSubSeq = this.getFirstBufferedTradeSeq();

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const rows = await fetchSnapshot();
      if (rows.length === 0) {
        this.applySnapshot(rows);
        return;
      }

      const dbLastSeq = this.getSnapshotLastTradeSeq(rows);
      if (firstSubSeq == null || dbLastSeq >= firstSubSeq) {
        this.applySnapshot(rows);
        return;
      }
      await sleep(POLL_INTERVAL_MS);
    }

    this.applySnapshot(await fetchSnapshot());
  }

  /** Bootstrap from Timescale continuous aggregates, then overlay newer fills. */
  applyDbSnapshot(rows: DbCandleRow[], overlayFills: FillForCandle[] = []): void {
    this.applySnapshot(rows);
    for (const fill of overlayFills) {
      this.applyFill(fill);
    }
  }

  /** Build the initial candle history by aggregating market fills client-side. */
  applyFillsSnapshot(fills: FillForCandle[]): void {
    this.candles = buildCandlesFromFills(fills, this.bucketMs);
    this.lastAppliedFillSeq = fills.reduce(
      (max, fill) =>
        Math.max(max, parseFillSeq(fill.fillId, this.marketSymbol)),
      -1,
    );
    for (const fill of fills) {
      this.seenFillIds.add(fill.fillId);
    }

    const pending = this.collectPendingTrades(this.lastAppliedFillSeq);
    for (const trade of pending) this.applyTrade(trade);

    this.buffer = [];
    this.state = "live";
  }

  /** Transition to live mode when no historical fills are available. */
  goLiveWithoutSnapshot(): void {
    if (this.state === "live") return;
    this.applySnapshot([]);
  }

  isLive(): boolean {
    return this.state === "live";
  }

  getCandles(): Candle[] {
    return this.candles;
  }

  getLastBucketTime(): number {
    const last = this.candles[this.candles.length - 1];
    return last?.t ?? 0;
  }

  private getFirstBufferedTradeSeq(): number | null {
    let min: number | null = null;
    for (const event of this.buffer) {
      for (const trade of event.trades) {
        const seq = parseFillSeq(trade.fillId, this.marketSymbol);
        if (seq < 0) continue;
        if (min == null || seq < min) min = seq;
      }
    }
    return min;
  }

  private getSnapshotLastTradeSeq(rows: DbCandleRow[]): number {
    let max = -1;
    for (const row of rows) {
      const id = rowLastTradeId(row);
      if (!id) continue;
      max = Math.max(max, parseFillSeq(id, this.marketSymbol));
    }
    return max;
  }

  private applySnapshot(rows: DbCandleRow[]): void {
    let candles = rows.map(fromDbRow).sort((a, b) => a.t - b.t);
    if (this.aggregateFactor > 1) {
      candles = aggregateCandles(candles, this.bucketMs);
    }

    this.candles = candles.slice(-MAX_CHART_CANDLES);
    this.lastAppliedFillSeq = this.getSnapshotLastTradeSeq(rows);

    for (const row of rows) {
      const id = rowLastTradeId(row);
      if (id) this.seenFillIds.add(id);
    }

    const pending = this.collectPendingTrades(this.lastAppliedFillSeq);
    for (const trade of pending) this.applyTrade(trade);

    this.buffer = [];
    this.state = "live";
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

  private applyTrade(trade: WireTrade, time = Date.now()): void {
    const seq = parseFillSeq(trade.fillId, this.marketSymbol);
    if (seq >= 0 && seq <= this.lastAppliedFillSeq) return;
    if (this.seenFillIds.has(trade.fillId)) return;

    if (seq >= 0) this.lastAppliedFillSeq = seq;
    this.seenFillIds.add(trade.fillId);
    this.candles = applyTradeToCandles(
      this.candles,
      trade.price,
      this.bucketMs,
      time,
    ).slice(-MAX_CHART_CANDLES);
  }

  private applyFill(fill: FillForCandle): void {
    if (this.seenFillIds.has(fill.fillId)) return;
    this.seenFillIds.add(fill.fillId);
    this.candles = applyTradeToCandles(
      this.candles,
      fill.price,
      this.bucketMs,
      fill.time,
    ).slice(-MAX_CHART_CANDLES);
    this.state = "live";
  }

  /** Update chart from a live WS trade or REST fill overlay. */
  onLiveTrade(
    price: number,
    time: number,
    fillId?: string,
  ): void {
    if (fillId) {
      if (this.seenFillIds.has(fillId)) return;
      this.seenFillIds.add(fillId);
    }
    this.candles = applyTradeToCandles(
      this.candles,
      price,
      this.bucketMs,
      time,
    ).slice(-MAX_CHART_CANDLES);
    this.state = "live";
  }
}

export function overlayFillsAfterDbSnapshot(
  fills: FillForCandle[],
  dbRows: DbCandleRow[],
  bucketMs: number,
): FillForCandle[] {
  return fillsAfterDbWatermark(fills, dbRows, bucketMs);
}
