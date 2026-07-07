import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTrading } from "../context/TradingContext";
import { MARKETS, getMarket } from "../lib/constants";
import { formatPrice, formatUsd } from "../lib/format";
import type { TradableSymbol } from "../lib/types";

interface SessionStat {
  open: number;
  high: number;
  low: number;
  volume: number;
}

function InlineStat({
  label,
  value,
  className = "text-[var(--wr-text)]",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[11px] text-[var(--wr-text-dim)]">{label}</span>
      <span className={`font-mono text-[12px] font-semibold ${className}`}>
        {value}
      </span>
    </div>
  );
}

export function MarketHeader() {
  const {
    currentSymbol,
    setCurrentSymbol,
    markPrice,
    indexPrice,
    markPrices,
    trades,
  } = useTrading();

  const market = getMarket(currentSymbol);
  const [menuOpen, setMenuOpen] = useState(false);
  const statsRef = useRef<Record<string, SessionStat>>({});

  useEffect(() => {
    if (markPrice == null) return;
    const prev = statsRef.current[currentSymbol];
    statsRef.current[currentSymbol] = prev
      ? {
          ...prev,
          high: Math.max(prev.high, markPrice),
          low: Math.min(prev.low, markPrice),
        }
      : { open: markPrice, high: markPrice, low: markPrice, volume: 0 };
  }, [markPrice, currentSymbol]);

  const stat = statsRef.current[currentSymbol];
  const change =
    stat && stat.open > 0 && markPrice != null
      ? ((markPrice - stat.open) / stat.open) * 100
      : 0;
  const volume = trades.reduce((sum, t) => sum + t.price * t.qty, 0);

  return (
    <div className="wr-market-header relative flex shrink-0 items-center gap-4 px-4 py-2.5">
      {/* Symbol + price block */}
      <div className="relative flex shrink-0 items-center gap-3 border-r border-[var(--wr-border-subtle)] pr-4">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors hover:bg-white/[0.04]"
        >
          <span className="text-[15px] font-bold text-white">{market.label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-[var(--wr-text-muted)]" />
        </button>

        {markPrice != null && (
          <span className="font-mono text-[20px] font-bold leading-none text-[var(--wr-green)]">
            {formatPrice(markPrice, market.pricePrecision)}
          </span>
        )}

        <span className="rounded-md border border-[var(--wr-green)]/20 bg-[var(--wr-green-glow)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--wr-green)]">
          10x
        </span>

        {menuOpen && (
          <div className="absolute left-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-xl border border-[var(--wr-border)] bg-[var(--wr-card-from)] py-1 shadow-2xl">
            {MARKETS.map((m) => {
              const price = markPrices[m.symbol];
              return (
                <button
                  key={m.symbol}
                  onClick={() => {
                    setCurrentSymbol(m.symbol as TradableSymbol);
                    setMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-[var(--wr-card-hover)] ${
                    m.symbol === currentSymbol
                      ? "text-white"
                      : "text-[var(--wr-text-muted)]"
                  }`}
                >
                  <span className="font-semibold">{m.label}</span>
                  <span className="font-mono text-xs text-[var(--wr-text-dim)]">
                    {formatPrice(price, m.pricePrecision)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Inline stats row */}
      <div className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto">
        <InlineStat
          label="Mark"
          value={formatPrice(markPrice, market.pricePrecision)}
          className="text-[var(--wr-green)]"
        />
        <InlineStat
          label="Index"
          value={formatPrice(indexPrice, market.pricePrecision)}
        />
        <InlineStat
          label="Funding / 8H"
          value="0.0200%"
          className="text-[var(--wr-green)]"
        />
        <InlineStat
          label="24H Change"
          value={`${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
          className={
            change >= 0 ? "text-[var(--wr-green)]" : "text-[var(--wr-red)]"
          }
        />
        <InlineStat
          label="24H High"
          value={formatPrice(stat?.high, market.pricePrecision)}
        />
        <InlineStat
          label="24H Low"
          value={formatPrice(stat?.low, market.pricePrecision)}
        />
        <InlineStat label="24H Volume" value={formatUsd(volume, 0)} />
      </div>
    </div>
  );
}
