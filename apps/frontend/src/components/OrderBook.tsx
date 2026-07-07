import { useMemo, useState } from "react";
import { useTrading } from "../context/TradingContext";
import { getMarket } from "../lib/constants";
import { formatPrice, formatQty, formatTime } from "../lib/format";

const ROWS = 11;

type CardView = "book" | "trade";

interface Row {
  price: number;
  size: number;
  total: number;
}

function buildRows(
  levels: [number, number][],
  count: number,
  topFirst: boolean,
): { rows: Row[]; maxTotal: number } {
  const sliced = levels.slice(0, count);
  let running = 0;
  const rows: Row[] = sliced.map(([price, size]) => {
    running += size;
    return { price, size, total: running };
  });
  const maxTotal = running || 1;
  return { rows: topFirst ? [...rows].reverse() : rows, maxTotal };
}

function ViewToggle({
  view,
  onChange,
}: {
  view: CardView;
  onChange: (v: CardView) => void;
}) {
  return (
    <div className="wr-segment mx-3 mt-2.5 mb-2">
      <div
        className={`wr-segment-thumb ${view === "trade" ? "wr-segment-thumb--right" : ""}`}
      />
      <button
        type="button"
        onClick={() => onChange("book")}
        className={`wr-segment-btn ${view === "book" ? "wr-segment-btn--active" : ""}`}
      >
        Order Book
      </button>
      <button
        type="button"
        onClick={() => onChange("trade")}
        className={`wr-segment-btn ${view === "trade" ? "wr-segment-btn--active" : ""}`}
      >
        Market Trades
      </button>
    </div>
  );
}

export function OrderBook() {
  const { trades, orderbook, currentSymbol, markPrice, lastPrice } =
    useTrading();
  const market = getMarket(currentSymbol);
  const [cardView, setCardView] = useState<CardView>("book");

  const { asks, bids, spread, spreadPct } = useMemo(() => {
    const askData = buildRows(orderbook.asks, ROWS, true);
    const bidData = buildRows(orderbook.bids, ROWS, false);
    const bestAsk = orderbook.asks[0]?.[0];
    const bestBid = orderbook.bids[0]?.[0];
    const sp = bestAsk && bestBid ? bestAsk - bestBid : null;
    return {
      asks: askData,
      bids: bidData,
      spread: sp,
      spreadPct: sp && bestBid ? (sp / bestBid) * 100 : null,
    };
  }, [orderbook]);

  const mid = markPrice ?? lastPrice;

  return (
    <div className="wr-card flex h-full flex-col overflow-hidden">
      <ViewToggle view={cardView} onChange={setCardView} />

      {cardView === "book" ? (
        <BookPanel
          market={market}
          asks={asks}
          bids={bids}
          spread={spread}
          spreadPct={spreadPct}
          mid={mid || undefined}
        />
      ) : (
        <TradesPanel market={market} trades={trades} />
      )}
    </div>
  );
}

function BookPanel({
  market,
  asks,
  bids,
  spread,
  spreadPct,
  mid,
}: {
  market: ReturnType<typeof getMarket>;
  asks: ReturnType<typeof buildRows>;
  bids: ReturnType<typeof buildRows>;
  spread: number | null;
  spreadPct: number | null;
  mid: number | undefined;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] text-[var(--wr-text-dim)]">
        <span>Price</span>
        <span className="text-right">Size ({market.base})</span>
        <span className="text-right">Total</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden font-mono text-[11px]">
        <div className="flex flex-1 flex-col justify-end overflow-hidden">
          {asks.rows.length === 0 ? (
            <div className="py-6 text-center font-sans text-[11px] text-[var(--wr-text-dim)]">
              No asks
            </div>
          ) : (
            asks.rows.map((row) => (
              <Level
                key={`a-${row.price}`}
                row={row}
                maxTotal={asks.maxTotal}
                color="var(--wr-red)"
                barColor="rgba(255, 69, 96, 0.18)"
                market={market}
              />
            ))
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-y border-[var(--wr-border-subtle)] bg-black/20 px-3 py-1.5">
          <span
            className={`text-[14px] font-bold ${
              (spread ?? 0) >= 0
                ? "text-[var(--wr-green)]"
                : "text-[var(--wr-red)]"
            }`}
          >
            {formatPrice(mid, market.pricePrecision)}
          </span>
          <span className="text-[10px] text-[var(--wr-text-dim)]">
            Spread{" "}
            {spread != null
              ? `${formatPrice(spread, market.pricePrecision)} (${spreadPct?.toFixed(3)}%)`
              : "—"}
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-start overflow-hidden">
          {bids.rows.length === 0 ? (
            <div className="py-6 text-center font-sans text-[11px] text-[var(--wr-text-dim)]">
              No bids
            </div>
          ) : (
            bids.rows.map((row) => (
              <Level
                key={`b-${row.price}`}
                row={row}
                maxTotal={bids.maxTotal}
                color="var(--wr-green)"
                barColor="rgba(45, 255, 136, 0.18)"
                market={market}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TradesPanel({
  market,
  trades,
}: {
  market: ReturnType<typeof getMarket>;
  trades: ReturnType<typeof useTrading>["trades"];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] text-[var(--wr-text-dim)]">
        <span>Price</span>
        <span className="text-right">Size ({market.base})</span>
        <span className="text-right">Time</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto font-mono text-[11px]">
        {trades.length === 0 ? (
          <div className="py-8 text-center font-sans text-[11px] text-[var(--wr-text-dim)]">
            No recent trades
          </div>
        ) : (
          trades.map((t) => (
            <div
              key={t.fillId}
              className="grid grid-cols-3 px-3 py-[3px] transition-colors hover:bg-white/[0.02]"
            >
              <span
                className="font-semibold"
                style={{ color: t.up ? "var(--wr-green)" : "var(--wr-red)" }}
              >
                {formatPrice(t.price, market.pricePrecision)}
              </span>
              <span className="text-right text-[var(--wr-text-secondary)]">
                {formatQty(t.qty, market.qtyPrecision)}
              </span>
              <span className="text-right text-[var(--wr-text-dim)]">
                {formatTime(t.time)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Level({
  row,
  maxTotal,
  color,
  barColor,
  market,
}: {
  row: Row;
  maxTotal: number;
  color: string;
  barColor: string;
  market: ReturnType<typeof getMarket>;
}) {
  return (
    <div className="relative grid grid-cols-3 px-3 py-[3px] transition-colors hover:bg-white/[0.02]">
      <div
        className="pointer-events-none absolute inset-y-0 right-0"
        style={{
          width: `${(row.total / maxTotal) * 100}%`,
          background: barColor,
        }}
      />
      <span className="relative z-10 font-semibold" style={{ color }}>
        {formatPrice(row.price, market.pricePrecision)}
      </span>
      <span className="relative z-10 text-right text-[var(--wr-text-secondary)]">
        {formatQty(row.size, market.qtyPrecision)}
      </span>
      <span className="relative z-10 text-right text-[var(--wr-text-dim)]">
        {formatQty(row.total, market.qtyPrecision)}
      </span>
    </div>
  );
}
