import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, X, Play, Square } from "lucide-react";
import {
  DEFAULT_SIMULATOR_CONFIG,
  getMarketSimulator,
  type MarketSimulatorConfig,
  type SimulatorStats,
} from "../lib/simulation/marketSimulator";
import { MARKETS, resolveLivePrice } from "../lib/constants";
import type { TradableSymbol } from "../lib/types";
import { useTrading } from "../context/TradingContext";

interface MarketSimulatorPanelProps {
  open: boolean;
  onClose: () => void;
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="wr-card-inset px-3 py-2">
      <div className="text-[10px] text-[var(--wr-text-dim)]">{label}</div>
      <div className="font-mono text-[14px] font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

export function MarketSimulatorPanel({
  open,
  onClose,
}: MarketSimulatorPanelProps) {
  const { lastPrices, markPrices, indexPrices } = useTrading();
  const [config, setConfig] = useState<MarketSimulatorConfig>(
    DEFAULT_SIMULATOR_CONFIG,
  );
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<SimulatorStats | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const appendLog = useCallback((line: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-80), `[${ts}] ${line}`]);
    requestAnimationFrame(() =>
      logEndRef.current?.scrollIntoView({ behavior: "smooth" }),
    );
  }, []);

  const resolvePrice = useCallback(
    (symbol: TradableSymbol) =>
      resolveLivePrice(symbol, {
        last: lastPrices[symbol],
        mark: markPrices[symbol],
        index: indexPrices[symbol],
      }) ?? null,
    [lastPrices, markPrices, indexPrices],
  );

  useEffect(() => {
    if (!running) {
      if (statsTimerRef.current) {
        clearInterval(statsTimerRef.current);
        statsTimerRef.current = null;
      }
      return;
    }
    statsTimerRef.current = setInterval(() => {
      setStats(getMarketSimulator().getStats());
    }, 500);
    return () => {
      if (statsTimerRef.current) clearInterval(statsTimerRef.current);
    };
  }, [running]);

  const onStart = () => {
    const sim = getMarketSimulator();
    if (sim.isRunning()) return;
    setLogs([]);
    setStats(null);
    setRunning(true);
    void sim.start(config, resolvePrice, appendLog).finally(() => {
      setRunning(false);
      setStats(sim.getStats());
    });
  };

  const onStop = () => {
    getMarketSimulator().stop();
  };

  const patch = (partial: Partial<MarketSimulatorConfig>) =>
    setConfig((c) => ({ ...c, ...partial }));

  if (!open) return null;

  const elapsedMin = stats
    ? ((Date.now() - stats.startedAt) / 60_000).toFixed(1)
    : "0";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="wr-card flex h-full w-full max-w-md flex-col border-l border-[var(--wr-border)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--wr-border-subtle)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Activity
              className={`h-4 w-4 ${running ? "animate-pulse text-[var(--wr-green)]" : "text-[var(--wr-text-muted)]"}`}
            />
            <h2 className="text-[15px] font-bold text-white">
              Market Simulator
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--wr-text-muted)] hover:bg-[var(--wr-card-hover)] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <p className="text-[12px] leading-relaxed text-[var(--wr-text-muted)]">
            Reuses existing <code className="text-[var(--wr-text-secondary)]">sim-bot-*</code>{" "}
            accounts from the database when available, only creating extra bots if
            needed. Bots place resting bids/asks plus random cancels — visible live
            in the order book via WebSocket.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-[11px]">
              <span className="text-[var(--wr-text-dim)]">Bot count</span>
              <input
                type="number"
                min={2}
                max={30}
                disabled={running}
                value={config.botCount}
                onChange={(e) => patch({ botCount: Number(e.target.value) })}
                className="wr-input w-full px-2 py-1.5 font-mono text-sm text-white"
              />
            </label>
            <label className="space-y-1 text-[11px]">
              <span className="text-[var(--wr-text-dim)]">Leverage</span>
              <input
                type="number"
                min={1}
                max={50}
                disabled={running}
                value={config.leverage}
                onChange={(e) => patch({ leverage: Number(e.target.value) })}
                className="wr-input w-full px-2 py-1.5 font-mono text-sm text-white"
              />
            </label>
            <label className="space-y-1 text-[11px]">
              <span className="text-[var(--wr-text-dim)]">Interval min (ms)</span>
              <input
                type="number"
                min={50}
                disabled={running}
                value={config.intervalMs[0]}
                onChange={(e) =>
                  patch({
                    intervalMs: [
                      Number(e.target.value),
                      Math.max(Number(e.target.value), config.intervalMs[1]),
                    ],
                  })
                }
                className="wr-input w-full px-2 py-1.5 font-mono text-sm text-white"
              />
            </label>
            <label className="space-y-1 text-[11px]">
              <span className="text-[var(--wr-text-dim)]">Interval max (ms)</span>
              <input
                type="number"
                min={50}
                disabled={running}
                value={config.intervalMs[1]}
                onChange={(e) =>
                  patch({
                    intervalMs: [
                      config.intervalMs[0],
                      Math.max(config.intervalMs[0], Number(e.target.value)),
                    ],
                  })
                }
                className="wr-input w-full px-2 py-1.5 font-mono text-sm text-white"
              />
            </label>
            <label className="space-y-1 text-[11px]">
              <span className="text-[var(--wr-text-dim)]">Cross prob</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                disabled={running}
                value={config.crossProbability}
                onChange={(e) =>
                  patch({ crossProbability: Number(e.target.value) })
                }
                className="wr-input w-full px-2 py-1.5 font-mono text-sm text-white"
              />
            </label>
            <label className="space-y-1 text-[11px]">
              <span className="text-[var(--wr-text-dim)]">Cancel prob</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                disabled={running}
                value={config.cancelProbability}
                onChange={(e) =>
                  patch({ cancelProbability: Number(e.target.value) })
                }
                className="wr-input w-full px-2 py-1.5 font-mono text-sm text-white"
              />
            </label>
            <label className="space-y-1 text-[11px]">
              <span className="text-[var(--wr-text-dim)]">Spread %</span>
              <input
                type="number"
                min={0.001}
                max={0.1}
                step={0.001}
                disabled={running}
                value={config.spreadPct}
                onChange={(e) => patch({ spreadPct: Number(e.target.value) })}
                className="wr-input w-full px-2 py-1.5 font-mono text-sm text-white"
              />
            </label>
            <label className="space-y-1 text-[11px]">
              <span className="text-[var(--wr-text-dim)]">Qty min / max</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0.01}
                  step={0.1}
                  disabled={running}
                  value={config.qtyRange[0]}
                  onChange={(e) =>
                    patch({
                      qtyRange: [Number(e.target.value), config.qtyRange[1]],
                    })
                  }
                  className="wr-input w-full px-2 py-1.5 font-mono text-sm text-white"
                />
                <input
                  type="number"
                  min={0.01}
                  step={0.1}
                  disabled={running}
                  value={config.qtyRange[1]}
                  onChange={(e) =>
                    patch({
                      qtyRange: [config.qtyRange[0], Number(e.target.value)],
                    })
                  }
                  className="wr-input w-full px-2 py-1.5 font-mono text-sm text-white"
                />
              </div>
            </label>
          </div>

          <div className="space-y-1 text-[11px]">
            <span className="text-[var(--wr-text-dim)]">Markets</span>
            <div className="flex flex-wrap gap-2">
              {MARKETS.map((m) => {
                const active = config.markets.includes(m.symbol);
                return (
                  <button
                    key={m.symbol}
                    disabled={running}
                    onClick={() => {
                      patch({
                        markets: active
                          ? config.markets.filter((s) => s !== m.symbol)
                          : [...config.markets, m.symbol],
                      });
                    }}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      active
                        ? "wr-pill-active text-[var(--wr-green)]"
                        : "border border-[var(--wr-border)] text-[var(--wr-text-muted)]"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {stats && (
            <div className="grid grid-cols-2 gap-2">
              <StatBox
                label="Orders placed"
                value={String(stats.ordersPlaced)}
              />
              <StatBox label="Bids" value={String(stats.bidsPlaced)} />
              <StatBox label="Asks" value={String(stats.asksPlaced)} />
              <StatBox
                label="Cancels"
                value={String(stats.ordersCancelled)}
              />
              <StatBox label="Errors" value={String(stats.errors)} />
              <StatBox label="Runtime (min)" value={elapsedMin} />
            </div>
          )}

          <div className="flex gap-2">
            {!running ? (
              <button
                onClick={onStart}
                disabled={config.markets.length === 0}
                className="wr-btn-primary flex flex-1 items-center justify-center gap-2 py-2.5 text-sm"
              >
                <Play className="h-4 w-4" />
                Start simulation
              </button>
            ) : (
              <button
                onClick={onStop}
                className="wr-btn-danger flex flex-1 items-center justify-center gap-2 py-2.5 text-sm"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            )}
          </div>

          <div className="wr-card-inset overflow-hidden">
            <div className="border-b border-[var(--wr-border-subtle)] px-3 py-1.5 text-[10px] uppercase tracking-wide text-[var(--wr-text-dim)]">
              Activity log
            </div>
            <pre className="max-h-48 overflow-auto p-3 font-mono text-[10px] leading-relaxed text-[var(--wr-text-secondary)]">
              {logs.length === 0 ? "—" : logs.join("\n")}
              <div ref={logEndRef} />
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
