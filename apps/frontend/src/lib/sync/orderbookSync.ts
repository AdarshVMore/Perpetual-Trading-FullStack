import type { DepthSnapshot, DepthUpdateData } from "../types";

export interface OrderbookView {
  asks: [number, number][]; // ascending price
  bids: [number, number][]; // descending price
}

type SyncState = "syncing" | "live";

/**
 * Keeps a single market's orderbook in sync.
 *
 * Flow (matches the engine's depth sequencing):
 *   1. Subscribe to `depth.updated` first, buffering every update.
 *   2. Fetch the depth snapshot (which carries `lastUpdatedDepthId`).
 *   3. Discard buffered updates at/before the snapshot id, replay the rest in
 *      order, then apply live updates only when id > lastAppliedDepthId.
 */
export class OrderbookSync {
  private state: SyncState = "syncing";
  private buffer: DepthUpdateData[] = [];
  private lastAppliedDepthId = 0;

  private asks = new Map<number, number>();
  private bids = new Map<number, number>();

  /** Buffered while syncing, applied (in-order, deduped) once live. */
  onUpdate(update: DepthUpdateData): void {
    if (this.state === "syncing") {
      this.buffer.push(update);
      return;
    }
    if (update.lastUpdatedDepthId <= this.lastAppliedDepthId) return;
    this.applyLevels(update);
    this.lastAppliedDepthId = update.lastUpdatedDepthId;
  }

  applySnapshot(snapshot: DepthSnapshot): void {
    this.asks = new Map();
    this.bids = new Map();
    for (const { price, quantity } of snapshot.asks) {
      if (quantity > 0) this.asks.set(price, quantity);
    }
    for (const { price, quantity } of snapshot.bids) {
      if (quantity > 0) this.bids.set(price, quantity);
    }

    this.lastAppliedDepthId = snapshot.lastUpdatedDepthId;

    const pending = this.buffer
      .filter((u) => u.lastUpdatedDepthId > snapshot.lastUpdatedDepthId)
      .sort((a, b) => a.lastUpdatedDepthId - b.lastUpdatedDepthId);

    for (const update of pending) {
      if (update.lastUpdatedDepthId <= this.lastAppliedDepthId) continue;
      this.applyLevels(update);
      this.lastAppliedDepthId = update.lastUpdatedDepthId;
    }

    this.buffer = [];
    this.state = "live";
  }

  private applyLevels(update: DepthUpdateData): void {
    for (const [priceStr, qty] of Object.entries(update.depthUpdates.asks)) {
      const price = Number(priceStr);
      if (qty <= 0) this.asks.delete(price);
      else this.asks.set(price, qty);
    }
    for (const [priceStr, qty] of Object.entries(update.depthUpdates.bids)) {
      const price = Number(priceStr);
      if (qty <= 0) this.bids.delete(price);
      else this.bids.set(price, qty);
    }
  }

  getView(): OrderbookView {
    return {
      asks: [...this.asks.entries()].sort((a, b) => a[0] - b[0]),
      bids: [...this.bids.entries()].sort((a, b) => b[0] - a[0]),
    };
  }

  /** Full depth snapshot from apps/ws (replaces book each update). */
  applyFullDepth(asks: [number, number][], bids: [number, number][]): void {
    this.asks = new Map(asks);
    this.bids = new Map(bids);
    this.buffer = [];
    this.state = "live";
  }
}
