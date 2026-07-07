import { useEffect, useRef, useState } from "react";
import { useTrading } from "../context/TradingContext";
import { getMarket } from "../lib/constants";
import type { ChartTimeframe } from "../lib/sync/candlesSync";

const CHART_TABS = ["Chart", "Depth", "Margin", "Funding", "Market Info"];
const TIMEFRAMES: ChartTimeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export function PriceChart() {
  const {
    candles,
    candlesReady,
    candleTimeframe,
    setCandleTimeframe,
    currentSymbol,
  } = useTrading();
  const market = getMarket(currentSymbol);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [, forceRender] = useState(0);
  const [activeTab, setActiveTab] = useState("Chart");

  useEffect(() => {
    forceRender((n) => n + 1);
  }, [candles, candlesReady, currentSymbol, candleTimeframe]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!candlesReady) {
      ctx.fillStyle = "#4a5360";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Loading candles…", width / 2, height / 2);
      return;
    }

    if (candles.length === 0) {
      ctx.fillStyle = "#4a5360";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for trades…", width / 2, height / 2);
      return;
    }

    const padRight = 64;
    const padBottom = 4;
    const plotW = width - padRight;
    const plotH = height - padBottom;

    let min = Infinity;
    let max = -Infinity;
    for (const c of candles) {
      min = Math.min(min, c.l);
      max = Math.max(max, c.h);
    }
    const range = max - min || max * 0.001 || 1;
    min -= range * 0.08;
    max += range * 0.08;
    const yOf = (p: number) => plotH - ((p - min) / (max - min)) * plotH;

    ctx.font = "10px JetBrains Mono, monospace";
    ctx.textAlign = "left";
    ctx.strokeStyle = "#141820";
    ctx.fillStyle = "#6b7585";
    const rows = 5;
    for (let i = 0; i <= rows; i++) {
      const y = (plotH / rows) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();
      const p = max - ((max - min) / rows) * i;
      ctx.fillText(p.toFixed(market.pricePrecision), plotW + 6, y + 3);
    }

    const slot = plotW / candles.length;
    const candleW = Math.max(1.5, Math.min(10, slot * 0.6));

    candles.forEach((c, i) => {
      const x = i * slot + slot / 2;
      const up = c.c >= c.o;
      const color = up ? "#2dff88" : "#ff4560";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      ctx.beginPath();
      ctx.moveTo(x, yOf(c.h));
      ctx.lineTo(x, yOf(c.l));
      ctx.stroke();

      const yo = yOf(c.o);
      const yc = yOf(c.c);
      const top = Math.min(yo, yc);
      const bodyH = Math.max(1, Math.abs(yc - yo));
      ctx.fillRect(x - candleW / 2, top, candleW, bodyH);
    });

    const last = candles[candles.length - 1];
    const lastY = yOf(last.c);
    ctx.strokeStyle = "#2dff88";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, lastY);
    ctx.lineTo(plotW, lastY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#2dff88";
    ctx.fillRect(plotW, lastY - 8, padRight, 16);
    ctx.fillStyle = "#041208";
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillText(last.c.toFixed(market.pricePrecision), plotW + 5, lastY + 3);
  });

  return (
    <div className="wr-card flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1 text-[13px]">
          {CHART_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                activeTab === tab
                  ? "wr-pill-active text-[var(--wr-green)]"
                  : "text-[var(--wr-text-muted)] hover:text-[var(--wr-text-secondary)]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setCandleTimeframe(tf)}
              className={`rounded-lg px-2 py-0.5 text-[11px] font-mono transition-colors ${
                candleTimeframe === tf
                  ? "wr-pill-active font-semibold"
                  : "text-[var(--wr-text-muted)] hover:text-[var(--wr-text-secondary)]"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden rounded-b-xl"
      >
        {activeTab === "Chart" ? (
          <canvas ref={canvasRef} className="absolute inset-0" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--wr-text-dim)]">
            {activeTab} view
          </div>
        )}
      </div>
    </div>
  );
}
