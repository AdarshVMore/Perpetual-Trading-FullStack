import { useState } from "react";
import { useTrading } from "../context/TradingContext";
import { getMarket } from "../lib/constants";
import {
  formatPrice,
  formatQty,
  formatSignedUsd,
  formatUsd,
  formatTime,
} from "../lib/format";

type Tab = "balances" | "positions" | "orders" | "fills";

const TABS: { id: Tab; label: string }[] = [
  { id: "balances", label: "Balances" },
  { id: "positions", label: "Positions" },
  { id: "orders", label: "Open Orders" },
  { id: "fills", label: "Fill History" },
];

const DECORATIVE = [
  "Borrows",
  "TWAP",
  "Order History",
  "Position History",
  "Funding History",
];

export function BottomPanel({
  onOpenAuth,
}: {
  onOpenAuth: (mode: "signin" | "signup") => void;
}) {
  const {
    isAuthenticated,
    positions,
    openOrders,
    fills,
    balance,
    markPrices,
    indexPrices,
  } = useTrading();
  const [tab, setTab] = useState<Tab>("balances");

  return (
    <div className="wr-card flex h-full flex-col">
      <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1">
        {TABS.map((t) => {
          const count =
            t.id === "positions"
              ? positions.length
              : t.id === "orders"
                ? openOrders.length
                : null;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${
                tab === t.id
                  ? "wr-pill-active text-[var(--wr-green)]"
                  : "text-[var(--wr-text-muted)] hover:text-[var(--wr-text-secondary)]"
              }`}
            >
              {t.label}
              {count != null && count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
        {DECORATIVE.map((d) => (
          <span
            key={d}
            className="cursor-not-allowed whitespace-nowrap px-3 py-2 text-[12px] font-medium text-[var(--wr-text-dim)]"
          >
            {d}
          </span>
        ))}
      </div>

      <div className="flex-1 overflow-auto border-t border-[var(--wr-border-subtle)]">
        {!isAuthenticated ? (
          <Empty>
            Please{" "}
            <button
              onClick={() => onOpenAuth("signin")}
              className="text-[var(--wr-green)] hover:underline"
            >
              log in
            </button>{" "}
            or{" "}
            <button
              onClick={() => onOpenAuth("signup")}
              className="text-[var(--wr-green)] hover:underline"
            >
              sign up
            </button>{" "}
            first
          </Empty>
        ) : tab === "balances" ? (
          <Balances balance={balance} />
        ) : tab === "positions" ? (
          <Positions
            positions={positions}
            markPrices={markPrices}
            indexPrices={indexPrices}
          />
        ) : tab === "orders" ? (
          <OpenOrders />
        ) : (
          <Fills fills={fills} />
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center py-10 text-[13px] text-[var(--wr-text-muted)]">
      {children}
    </div>
  );
}

function Balances({
  balance,
}: {
  balance: { available: number; locked: number };
}) {
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[10px] text-[var(--wr-text-dim)]">
          <th className="px-4 py-2 font-medium">Asset</th>
          <th className="px-4 py-2 text-right font-medium">Available</th>
          <th className="px-4 py-2 text-right font-medium">Locked (Margin)</th>
          <th className="px-4 py-2 text-right font-medium">Total Equity</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        <tr className="border-t border-[var(--wr-border-subtle)]">
          <td className="px-4 py-2.5 font-sans font-bold text-white">USD</td>
          <td className="px-4 py-2.5 text-right text-[var(--wr-text-secondary)]">
            {formatUsd(balance.available)}
          </td>
          <td className="px-4 py-2.5 text-right text-[var(--wr-amber)]">
            {formatUsd(balance.locked)}
          </td>
          <td className="px-4 py-2.5 text-right font-bold text-white">
            {formatUsd(balance.available + balance.locked)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Positions({
  positions,
  markPrices,
  indexPrices,
}: {
  positions: ReturnType<typeof useTrading>["positions"];
  markPrices: ReturnType<typeof useTrading>["markPrices"];
  indexPrices: ReturnType<typeof useTrading>["indexPrices"];
}) {
  if (positions.length === 0) return <Empty>No open positions</Empty>;

  return (
    <div className="space-y-2 p-3">
      {positions.map((p) => {
        const market = getMarket(p.marketSymbol);
        const mark = markPrices[p.marketSymbol] ?? p.entryPrice;
        const index = indexPrices[p.marketSymbol] ?? p.entryPrice;
        const diff =
          p.type === "LONG" ? index - p.entryPrice : p.entryPrice - index;
        const pnl = diff * p.quantity;
        const pnlPct = p.margin > 0 ? (pnl / p.margin) * 100 : 0;
        const isProfit = pnl >= 0;

        return (
          <div
            key={p.marketSymbol}
            className="wr-card-inset grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 p-3"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{market.label}</span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                  p.type === "LONG"
                    ? "bg-[var(--wr-green-glow)] text-[var(--wr-green)]"
                    : "bg-[var(--wr-red-glow)] text-[var(--wr-red)]"
                }`}
              >
                {p.type} · {p.marginType}
              </span>
            </div>
            <span
              className={`font-mono text-sm font-bold ${
                isProfit ? "text-[var(--wr-green)]" : "text-[var(--wr-red)]"
              }`}
            >
              {formatSignedUsd(pnl)} ({pnlPct >= 0 ? "+" : ""}
              {pnlPct.toFixed(1)}%)
            </span>

            <div className="col-span-2 grid grid-cols-4 gap-3 text-[11px]">
              <div>
                <div className="text-[var(--wr-text-dim)]">Size</div>
                <div className="font-mono text-[var(--wr-text-secondary)]">
                  {formatQty(p.quantity, market.qtyPrecision)}
                </div>
              </div>
              <div>
                <div className="text-[var(--wr-text-dim)]">Entry</div>
                <div className="font-mono text-[var(--wr-text-secondary)]">
                  {formatPrice(p.entryPrice, market.pricePrecision)}
                </div>
              </div>
              <div>
                <div className="text-[var(--wr-text-dim)]">Mark</div>
                <div className="font-mono text-[var(--wr-text-secondary)]">
                  {formatPrice(mark, market.pricePrecision)}
                </div>
              </div>
              <div>
                <div className="text-[var(--wr-text-dim)]">Liq. Price</div>
                <div className="font-mono text-[var(--wr-amber)]">
                  {formatPrice(p.liquidationPrice, market.pricePrecision)}
                </div>
              </div>
            </div>

            {/* PNL bar */}
            <div className="col-span-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
                <div
                  className={`h-full rounded-full transition-all ${
                    isProfit ? "bg-[var(--wr-green)]" : "bg-[var(--wr-red)]"
                  }`}
                  style={{
                    width: `${Math.min(100, Math.abs(pnlPct))}%`,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Full table view for detailed columns */}
      <table className="mt-2 w-full text-[12px]">
        <thead>
          <tr className="text-left text-[10px] text-[var(--wr-text-dim)]">
            <th className="px-4 py-2 font-medium">Market</th>
            <th className="px-4 py-2 font-medium">Side</th>
            <th className="px-4 py-2 text-right font-medium">Size</th>
            <th className="px-4 py-2 text-right font-medium">Entry</th>
            <th className="px-4 py-2 text-right font-medium">Mark</th>
            <th className="px-4 py-2 text-right font-medium">Liq. Price</th>
            <th className="px-4 py-2 text-right font-medium">Margin</th>
            <th className="px-4 py-2 text-right font-medium">Unrealized PnL</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {positions.map((p) => {
            const market = getMarket(p.marketSymbol);
            const mark = markPrices[p.marketSymbol] ?? p.entryPrice;
            const index = indexPrices[p.marketSymbol] ?? p.entryPrice;
            const diff =
              p.type === "LONG" ? index - p.entryPrice : p.entryPrice - index;
            const pnl = diff * p.quantity;
            const pnlPct = p.margin > 0 ? (pnl / p.margin) * 100 : 0;
            return (
              <tr
                key={`table-${p.marketSymbol}`}
                className="border-t border-[var(--wr-border-subtle)] hover:bg-white/[0.02]"
              >
                <td className="px-4 py-2 font-sans font-bold text-white">
                  {market.label}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      p.type === "LONG"
                        ? "bg-[var(--wr-green-glow)] text-[var(--wr-green)]"
                        : "bg-[var(--wr-red-glow)] text-[var(--wr-red)]"
                    }`}
                  >
                    {p.type} · {p.marginType}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-[var(--wr-text-secondary)]">
                  {formatQty(p.quantity, market.qtyPrecision)}
                </td>
                <td className="px-4 py-2 text-right text-[var(--wr-text-muted)]">
                  {formatPrice(p.entryPrice, market.pricePrecision)}
                </td>
                <td className="px-4 py-2 text-right text-[var(--wr-text-muted)]">
                  {formatPrice(mark, market.pricePrecision)}
                </td>
                <td className="px-4 py-2 text-right text-[var(--wr-amber)]">
                  {formatPrice(p.liquidationPrice, market.pricePrecision)}
                </td>
                <td className="px-4 py-2 text-right text-[var(--wr-text-muted)]">
                  {formatUsd(p.margin)}
                </td>
                <td
                  className={`px-4 py-2 text-right font-semibold ${
                    pnl >= 0 ? "text-[var(--wr-green)]" : "text-[var(--wr-red)]"
                  }`}
                >
                  {formatSignedUsd(pnl)} ({pnlPct >= 0 ? "+" : ""}
                  {pnlPct.toFixed(2)}%)
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OpenOrders() {
  const { openOrders, cancelOrder } = useTrading();
  if (openOrders.length === 0) return <Empty>No open orders</Empty>;

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[10px] text-[var(--wr-text-dim)]">
          <th className="px-4 py-2 font-medium">Market</th>
          <th className="px-4 py-2 font-medium">Side</th>
          <th className="px-4 py-2 font-medium">Type</th>
          <th className="px-4 py-2 text-right font-medium">Price</th>
          <th className="px-4 py-2 text-right font-medium">Size</th>
          <th className="px-4 py-2 text-right font-medium">Filled</th>
          <th className="px-4 py-2 text-right font-medium">Status</th>
          <th className="px-4 py-2 text-right font-medium">Action</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {openOrders.map((o) => {
          const market = getMarket(o.marketSymbol);
          return (
            <tr
              key={o.orderId}
              className="border-t border-[var(--wr-border-subtle)] hover:bg-white/[0.02]"
            >
              <td className="px-4 py-2 font-sans font-bold text-white">
                {market.label}
              </td>
              <td
                className={`px-4 py-2 font-bold ${
                  o.side === "BUY"
                    ? "text-[var(--wr-green)]"
                    : "text-[var(--wr-red)]"
                }`}
              >
                {o.side}
              </td>
              <td className="px-4 py-2 text-[var(--wr-text-muted)]">
                {o.type}
              </td>
              <td className="px-4 py-2 text-right text-[var(--wr-text-secondary)]">
                {formatPrice(o.price, market.pricePrecision)}
              </td>
              <td className="px-4 py-2 text-right text-[var(--wr-text-secondary)]">
                {formatQty(o.quantity, market.qtyPrecision)}
              </td>
              <td className="px-4 py-2 text-right text-[var(--wr-text-muted)]">
                {formatQty(o.filledQuantity, market.qtyPrecision)}
              </td>
              <td className="px-4 py-2 text-right text-[10px] text-[var(--wr-text-dim)]">
                {o.status}
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  onClick={() => void cancelOrder(o)}
                  className="rounded-lg border border-[var(--wr-red)]/30 px-2 py-0.5 text-[11px] font-semibold text-[var(--wr-red)] transition-colors hover:bg-[var(--wr-red-glow)]"
                >
                  Cancel
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Fills({ fills }: { fills: ReturnType<typeof useTrading>["fills"] }) {
  if (fills.length === 0) return <Empty>No fills yet</Empty>;

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[10px] text-[var(--wr-text-dim)]">
          <th className="px-4 py-2 font-medium">Market</th>
          <th className="px-4 py-2 font-medium">Side</th>
          <th className="px-4 py-2 text-right font-medium">Price</th>
          <th className="px-4 py-2 text-right font-medium">Size</th>
          <th className="px-4 py-2 text-right font-medium">Status</th>
          <th className="px-4 py-2 text-right font-medium">Time</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {fills.map((f, i) => {
          const market = getMarket(f.marketSymbol);
          return (
            <tr
              key={`${f.fillId}-${i}`}
              className="border-t border-[var(--wr-border-subtle)] hover:bg-white/[0.02]"
            >
              <td className="px-4 py-2 font-sans font-bold text-white">
                {market.label}
              </td>
              <td
                className={`px-4 py-2 font-bold ${
                  f.side === "BUY"
                    ? "text-[var(--wr-green)]"
                    : "text-[var(--wr-red)]"
                }`}
              >
                {f.side}
              </td>
              <td className="px-4 py-2 text-right text-[var(--wr-text-secondary)]">
                {formatPrice(f.price, market.pricePrecision)}
              </td>
              <td className="px-4 py-2 text-right text-[var(--wr-text-secondary)]">
                {formatQty(f.qty, market.qtyPrecision)}
              </td>
              <td className="px-4 py-2 text-right text-[10px] text-[var(--wr-text-dim)]">
                {f.status}
              </td>
              <td className="px-4 py-2 text-right text-[var(--wr-text-dim)]">
                {formatTime(f.time)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
