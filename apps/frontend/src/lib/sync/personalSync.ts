import type {
  BalanceSnapshot,
  PositionSnapshot,
  TradableSymbol,
  UiFill,
  UiPosition,
  UserFillData,
  WirePosition,
} from "../types";

export interface PersonalBalance {
  available: number;
  locked: number;
}

type SyncState = "syncing" | "live";

const MAX_FILL_HISTORY = 100;

function toUiPosition(p: WirePosition): UiPosition {
  return {
    marketSymbol: p.marketSymbol,
    type: p.type,
    quantity: p.quantity,
    entryPrice: p.price,
    margin: p.margin,
    marginType: p.marginType,
    liquidationPrice: p.liquidationPrice,
  };
}

/**
 * Keeps the user's positions, balance and fill history in sync from the
 * personal `userfill.created` stream.
 *
 * Flow (mirrors the orderbook offset pattern, but per-user):
 *   1. Subscribe to `userfill.created` first, buffering fills.
 *   2. Fetch the position snapshot, which carries `lastFillId`.
 *   3. Discard buffered fills at/before lastFillId, apply the rest, then apply
 *      live fills only when userFillId > lastAppliedFillId.
 *
 * Each fill carries the authoritative resulting position + account balance, so
 * applying a fill is a direct assignment (no client-side PnL math, no drift).
 */
export class PersonalSync {
  private state: SyncState = "syncing";
  private buffer: UserFillData[] = [];
  private lastAppliedFillId = 0;

  private positions = new Map<TradableSymbol, UiPosition>();
  private balance: PersonalBalance = { available: 0, locked: 0 };
  private fills: UiFill[] = [];

  /** Absolute balance from `get_balance` / `balance_updated` (always trusted). */
  setBalance(snapshot: BalanceSnapshot): void {
    this.balance = {
      available: snapshot.balance,
      locked: snapshot.lockedBalance,
    };
  }

  applyPositionSnapshot(snapshot: PositionSnapshot): void {
    this.positions = new Map();
    for (const pos of Object.values(snapshot.positions)) {
      if (pos) this.positions.set(pos.marketSymbol, toUiPosition(pos));
    }
    this.lastAppliedFillId = snapshot.lastFillId;

    const pending = this.buffer
      .filter((f) => f.userFillId > snapshot.lastFillId)
      .sort((a, b) => a.userFillId - b.userFillId);

    for (const fill of pending) this.applyFill(fill);

    this.buffer = [];
    this.state = "live";
  }

  onUserFill(data: UserFillData): void {
    if (this.state === "syncing") {
      this.buffer.push(data);
      return;
    }
    this.applyFill(data);
  }

  private applyFill(data: UserFillData): void {
    if (data.userFillId <= this.lastAppliedFillId) return; // already reflected
    this.lastAppliedFillId = data.userFillId;

    // authoritative resulting position for this market
    if (data.position) {
      this.positions.set(data.marketSymbol, toUiPosition(data.position));
    } else {
      this.positions.delete(data.marketSymbol);
    }

    // authoritative balance right after this fill
    this.balance = {
      available: data.balance,
      locked: data.lockedBalance,
    };

    this.fills = [
      {
        fillId: data.fillId,
        marketSymbol: data.marketSymbol,
        side: data.side,
        price: data.price,
        qty: data.qty,
        status: data.orderStatus,
        time: Date.now(),
      },
      ...this.fills,
    ].slice(0, MAX_FILL_HISTORY);
  }

  getPositions(): UiPosition[] {
    return [...this.positions.values()];
  }

  getBalance(): PersonalBalance {
    return this.balance;
  }

  /** Prepend HTTP-recovered fills; skips ids already applied via the live stream. */
  seedFills(historical: UiFill[]): void {
    if (historical.length === 0) return;
    const existingIds = new Set(this.fills.map((f) => f.fillId));
    const pending = historical.filter((f) => !existingIds.has(f.fillId));
    if (pending.length === 0) return;
    this.fills = [...this.fills, ...pending].slice(0, MAX_FILL_HISTORY);
  }

  getFills(): UiFill[] {
    return this.fills;
  }

  getLastFillId(): number {
    return this.lastAppliedFillId;
  }
}
