import { useCallback, useRef, useState } from "react";
import {
  DEFAULT_LOAD_TEST_CONFIG,
  runLoadTest,
  type LoadTestConfig,
  type LoadTestResult,
} from "../lib/loadTest/runLoadTest";
import { MARKETS, getMarket, resolveLivePrice } from "../lib/constants";
import type { TradableSymbol } from "../lib/types";
import { useTrading } from "../context/TradingContext";

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-[#2a2e39] bg-[#131722] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[#848e9c]">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] text-[#eaecef]">
        {value}
        {unit && <span className="ml-1 text-[11px] text-[#848e9c]">{unit}</span>}
      </div>
    </div>
  );
}

export function LoadTestPanel() {
  const { lastPrices, markPrices, indexPrices } = useTrading();
  const [config, setConfig] = useState<LoadTestConfig>(DEFAULT_LOAD_TEST_CONFIG);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<LoadTestResult | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [...prev, line]);
    requestAnimationFrame(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, []);

  const livePrice = resolveLivePrice(config.marketSymbol, {
    last: lastPrices[config.marketSymbol],
    mark: markPrices[config.marketSymbol],
    index: indexPrices[config.marketSymbol],
  });

  const onRun = async () => {
    setRunning(true);
    setLogs([]);
    setResult(null);
    appendLog(`Started at ${new Date().toISOString()}`);

    const res = await runLoadTest(
      { ...config, price: livePrice ?? 0 },
      appendLog,
    );
    setResult(res);
    setRunning(false);
  };

  const patch = (partial: Partial<LoadTestConfig>) =>
    setConfig((c) => ({ ...c, ...partial }));

  const patchDelay = (idx: 0 | 1, seconds: number) => {
    const ms = Math.max(0, seconds) * 1000;
    setConfig((c) => {
      const next: [number, number] = [...c.delayMs] as [number, number];
      next[idx] = ms;
      if (next[0] > next[1]) next[1] = next[0];
      return { ...c, delayMs: next };
    });
  };

  const patchQty = (idx: 0 | 1, value: number) => {
    setConfig((c) => {
      const next: [number, number] = [...c.qtyRange] as [number, number];
      next[idx] = Math.max(0, value);
      if (next[0] > next[1]) next[1] = next[0];
      return { ...c, qtyRange: next };
    });
  };

  const market = getMarket(config.marketSymbol);

  return (
    <div className="min-h-screen bg-[#0a0b0d] p-6 text-[#c4c9d2]">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-[#eaecef]">Order Load Test</h1>
          <p className="mt-1 text-[13px] text-[#848e9c]">
            Each user picks a random side, price around the index, and quantity
            within your min/max range, then waits a random interval before the
            next order.
          </p>
          <a
            href="/"
            className="mt-2 inline-block text-[12px] text-[#f0b90b] hover:underline"
          >
            ← Back to trading UI
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="space-y-1 text-[12px]">
            <span className="text-[#848e9c]">Users</span>
            <input
              type="number"
              min={1}
              value={config.userCount}
              disabled={running}
              onChange={(e) => patch({ userCount: Number(e.target.value) })}
              className="w-full rounded border border-[#2a2e39] bg-[#131722] px-2 py-1.5 font-mono"
            />
          </label>
          <label className="space-y-1 text-[12px]">
            <span className="text-[#848e9c]">Orders per user</span>
            <input
              type="number"
              min={1}
              value={config.decisionsPerUser}
              disabled={running}
              onChange={(e) => patch({ decisionsPerUser: Number(e.target.value) })}
              className="w-full rounded border border-[#2a2e39] bg-[#131722] px-2 py-1.5 font-mono"
            />
          </label>
          <label className="space-y-1 text-[12px] sm:col-span-2">
            <span className="text-[#848e9c]">Market</span>
            <select
              value={config.marketSymbol}
              disabled={running}
              onChange={(e) =>
                patch({ marketSymbol: e.target.value as TradableSymbol })
              }
              className="w-full rounded border border-[#2a2e39] bg-[#131722] px-2 py-1.5"
            >
              {MARKETS.map((m) => (
                <option key={m.symbol} value={m.symbol}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="font-mono text-[11px] text-[#848e9c]">
              {livePrice != null
                ? `Index ~$${livePrice.toFixed(market.pricePrecision)} (live)`
                : "Index fetched from feed when run starts"}
            </div>
          </label>
          <label className="space-y-1 text-[12px]">
            <span className="text-[#848e9c]">Qty min ({market.base})</span>
            <input
              type="number"
              min={0}
              step={0.0001}
              value={config.qtyRange[0]}
              disabled={running}
              onChange={(e) => patchQty(0, Number(e.target.value))}
              className="w-full rounded border border-[#2a2e39] bg-[#131722] px-2 py-1.5 font-mono"
            />
          </label>
          <label className="space-y-1 text-[12px]">
            <span className="text-[#848e9c]">Qty max ({market.base})</span>
            <input
              type="number"
              min={0}
              step={0.0001}
              value={config.qtyRange[1]}
              disabled={running}
              onChange={(e) => patchQty(1, Number(e.target.value))}
              className="w-full rounded border border-[#2a2e39] bg-[#131722] px-2 py-1.5 font-mono"
            />
          </label>
          <label className="space-y-1 text-[12px]">
            <span className="text-[#848e9c]">Delay min (sec)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={config.delayMs[0] / 1000}
              disabled={running}
              onChange={(e) => patchDelay(0, Number(e.target.value))}
              className="w-full rounded border border-[#2a2e39] bg-[#131722] px-2 py-1.5 font-mono"
            />
          </label>
          <label className="space-y-1 text-[12px]">
            <span className="text-[#848e9c]">Delay max (sec)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={config.delayMs[1] / 1000}
              disabled={running}
              onChange={(e) => patchDelay(1, Number(e.target.value))}
              className="w-full rounded border border-[#2a2e39] bg-[#131722] px-2 py-1.5 font-mono"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={running}
          onClick={() => void onRun()}
          className="rounded-lg bg-[#f0b90b] px-5 py-2.5 text-[13px] font-semibold text-[#0a0b0d] disabled:opacity-50"
        >
          {running ? "Running…" : "Run load test"}
        </button>

        {result && (
          <div className="space-y-3">
            <div
              className={`rounded-lg border px-3 py-2 text-[13px] ${
                result.ok
                  ? "border-[#16c784]/40 bg-[#0c1a13] text-[#16c784]"
                  : "border-[#f6465d]/40 bg-[#1a0d10] text-[#f6465d]"
              }`}
            >
              {result.ok
                ? `Done — ${result.bidsPlaced} bids, ${result.asksPlaced} asks`
                : result.error ?? "Incomplete"}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Orders" value={String(result.ordersSubmitted)} />
              <Stat label="Bids" value={String(result.bidsPlaced)} />
              <Stat label="Asks" value={String(result.asksPlaced)} />
              <Stat label="Setup" value={result.timings.setupMs.toFixed(0)} unit="ms" />
              <Stat
                label="BUY avg / p99"
                value={`${result.summary.buyAvgMs.toFixed(1)} / ${result.summary.buyP99Ms.toFixed(1)}`}
                unit="ms"
              />
              <Stat
                label="SELL avg / p99"
                value={`${result.summary.sellAvgMs.toFixed(1)} / ${result.summary.sellP99Ms.toFixed(1)}`}
                unit="ms"
              />
              <Stat
                label="Span"
                value={result.summary.placementSpanMs.toFixed(0)}
                unit="ms"
              />
            </div>
          </div>
        )}

        <div className="rounded-lg border border-[#2a2e39] bg-[#131722]">
          <div className="border-b border-[#2a2e39] px-3 py-2 text-[11px] uppercase tracking-wide text-[#848e9c]">
            Log
          </div>
          <pre className="max-h-80 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-[#b7bdc6]">
            {logs.length === 0 ? "—" : logs.join("\n")}
            <div ref={logEndRef} />
          </pre>
        </div>
      </div>
    </div>
  );
}
