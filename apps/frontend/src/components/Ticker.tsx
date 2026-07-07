import { useTrading } from "../context/TradingContext";
import { MARKETS } from "../lib/constants";
import { formatPrice } from "../lib/format";

export function Ticker() {
  const { markPrices, indexPrices, connected } = useTrading();

  const items = MARKETS.map((m) => {
    const mark = markPrices[m.symbol];
    const index = indexPrices[m.symbol];
    const change =
      mark != null && index != null && index > 0
        ? ((mark - index) / index) * 100
        : 0;
    return { ...m, mark, change };
  });

  const loop = [...items, ...items];

  return (
    <footer className="flex h-8 shrink-0 items-center overflow-hidden border-t border-[var(--wr-border)] bg-[var(--wr-bg)]">
      <div className="flex shrink-0 items-center gap-2 border-r border-[var(--wr-border)] px-4 text-[11px]">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connected
              ? "bg-[var(--wr-green)] shadow-[0_0_4px_var(--wr-green)]"
              : "bg-[var(--wr-red)]"
          }`}
        />
        <span className="text-[var(--wr-text-muted)]">
          Connection:{" "}
          <span
            className={
              connected ? "text-[var(--wr-green)]" : "text-[var(--wr-red)]"
            }
          >
            {connected ? "Stable" : "Disconnected"}
          </span>
        </span>
      </div>

      <div className=" flex flex-1 items-center gap-6 whitespace-nowrap px-4 text-[11px] font-mono">
        {loop.map((item, i) => (
          <span key={`${item.symbol}-${i}`} className="flex items-center gap-1.5">
            <span className="font-semibold text-[var(--wr-text-secondary)]">
              {item.label}
            </span>
            <span className="text-white">
              {formatPrice(item.mark, item.pricePrecision)}
            </span>
            <span
              className={
                item.change >= 0
                  ? "text-[var(--wr-green)]"
                  : "text-[var(--wr-red)]"
              }
            >
              {item.change >= 0 ? "+" : ""}
              {item.change.toFixed(2)}%
            </span>
          </span>
        ))}
      </div>

      <div className="hidden shrink-0 border-l border-[var(--wr-border)] px-4 text-[10px] text-[var(--wr-text-dim)] sm:block">
        © 2024–2026 WhiteRock by Adarsh More
      </div>
    </footer>
  );
}
