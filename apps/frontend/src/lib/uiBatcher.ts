/** ~20fps UI refresh; coalesces high-frequency WS updates before React re-renders. */
export const UI_UPDATE_INTERVAL_MS = 50;

export interface UiBatcher {
  markOrderbookDirty: () => void;
  markTradesDirty: () => void;
  flushNow: () => void;
  dispose: () => void;
}

export function createUiBatcher(flushers: {
  orderbook: () => void;
  trades: () => void;
}): UiBatcher {
  let orderbookDirty = false;
  let tradesDirty = false;

  const tick = () => {
    if (orderbookDirty) {
      orderbookDirty = false;
      flushers.orderbook();
    }
    if (tradesDirty) {
      tradesDirty = false;
      flushers.trades();
    }
  };

  const timer = setInterval(tick, UI_UPDATE_INTERVAL_MS);

  return {
    markOrderbookDirty() {
      orderbookDirty = true;
    },
    markTradesDirty() {
      tradesDirty = true;
    },
    flushNow: tick,
    dispose() {
      clearInterval(timer);
      tick();
    },
  };
}
