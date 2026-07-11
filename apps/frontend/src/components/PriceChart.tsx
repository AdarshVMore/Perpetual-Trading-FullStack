import { useCallback, useEffect, useRef, useState } from "react";
import { useTrading } from "../context/TradingContext";
import { getMarket } from "../lib/constants";
import { formatPrice, formatTime } from "../lib/format";
import type { Candle } from "../lib/sync/candlesSync";
import type { ChartTimeframe } from "../lib/sync/candlesSync";

const CHART_TABS = ["Chart", "Depth", "Margin", "Funding", "Market Info"];
const TIMEFRAMES: ChartTimeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const PAD_RIGHT = 64;
const PAD_BOTTOM = 4;
const MIN_VISIBLE_CANDLES = 10;
const ZOOM_FACTOR = 1.12;

interface Viewport {
  start: number;
  count: number;
}

interface HoverInfo {
  index: number;
  clientX: number;
  clientY: number;
}

function clampViewport(vp: Viewport, total: number): Viewport {
  if (total <= 0) return { start: 0, count: 1 };
  const count = Math.min(total, Math.max(MIN_VISIBLE_CANDLES, vp.count));
  const maxStart = Math.max(0, total - count);
  const start = Math.min(maxStart, Math.max(0, vp.start));
  return { start, count };
}

function candleAtX(x: number, plotW: number, vp: Viewport): number {
  return vp.start + (x / plotW) * vp.count;
}

function formatCandleTime(ms: number, timeframe: ChartTimeframe): string {
  const date = new Date(ms);
  if (timeframe === "1d") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (timeframe === "4h" || timeframe === "1h") {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return formatTime(ms);
}

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
  const viewportRef = useRef<Viewport>({ start: 0, count: MIN_VISIBLE_CANDLES });
  const hoverRef = useRef<HoverInfo | null>(null);
  const dragRef = useRef<{ lastX: number } | null>(null);
  const pinchRef = useRef<{ dist: number; centerX: number } | null>(null);
  const prevCandleCountRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<HoverInfo | null>(null);
  const [activeTab, setActiveTab] = useState("Chart");

  const liveRef = useRef({
    candles,
    candlesReady,
    pricePrecision: market.pricePrecision,
  });
  liveRef.current = {
    candles,
    candlesReady,
    pricePrecision: market.pricePrecision,
  };

  const resetViewport = useCallback((total: number) => {
    viewportRef.current = clampViewport({ start: 0, count: total }, total);
  }, []);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const { candles, candlesReady, pricePrecision } = liveRef.current;

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

    const plotW = width - PAD_RIGHT;
    const plotH = height - PAD_BOTTOM;
    const vp = clampViewport(viewportRef.current, candles.length);
    viewportRef.current = vp;

    const visible = candles.slice(
      Math.floor(vp.start),
      Math.ceil(vp.start + vp.count),
    );

    let min = Infinity;
    let max = -Infinity;
    for (const c of visible) {
      min = Math.min(min, c.l);
      max = Math.max(max, c.h);
    }
    const range = max - min || max * 0.001 || 1;
    min -= range * 0.08;
    max += range * 0.08;
    const yOf = (p: number) => plotH - ((p - min) / (max - min)) * plotH;
    const xOf = (index: number) =>
      ((index - vp.start) / vp.count) * plotW + plotW / vp.count / 2;

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
      ctx.fillText(p.toFixed(pricePrecision), plotW + 6, y + 3);
    }

    const slot = plotW / vp.count;
    const candleW = Math.max(1.5, Math.min(10, slot * 0.6));
    const hoverIndex = hoverRef.current?.index ?? -1;

    candles.forEach((c, i) => {
      if (i < Math.floor(vp.start) || i >= Math.ceil(vp.start + vp.count)) return;

      const x = xOf(i);
      const up = c.c >= c.o;
      const isHovered = i === hoverIndex;
      const color = up ? "#2dff88" : "#ff4560";
      ctx.strokeStyle = isHovered ? "#e8ecf1" : color;
      ctx.fillStyle = isHovered ? (up ? "#5dffb0" : "#ff7a8e") : color;

      ctx.beginPath();
      ctx.moveTo(x, yOf(c.h));
      ctx.lineTo(x, yOf(c.l));
      ctx.lineWidth = isHovered ? 1.5 : 1;
      ctx.stroke();
      ctx.lineWidth = 1;

      const yo = yOf(c.o);
      const yc = yOf(c.c);
      const top = Math.min(yo, yc);
      const bodyH = Math.max(1, Math.abs(yc - yo));
      ctx.fillRect(x - candleW / 2, top, candleW, bodyH);
    });

    const hover = hoverRef.current;
    if (hover && hover.index >= 0 && hover.index < candles.length) {
      const hx = xOf(hover.index);
      const candle = candles[hover.index];

      ctx.strokeStyle = "rgba(154, 163, 178, 0.45)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, plotH);
      ctx.stroke();

      const hy = yOf(candle.c);
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(plotW, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(45, 255, 136, 0.95)";
      ctx.fillRect(plotW, hy - 8, PAD_RIGHT, 16);
      ctx.fillStyle = "#041208";
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.fillText(
        candle.c.toFixed(pricePrecision),
        plotW + 5,
        hy + 3,
      );
    } else {
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
      ctx.fillRect(plotW, lastY - 8, PAD_RIGHT, 16);
      ctx.fillStyle = "#041208";
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.fillText(last.c.toFixed(pricePrecision), plotW + 5, lastY + 3);
    }
  }, []);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawChart();
    });
  }, [drawChart]);

  useEffect(() => {
    const total = candles.length;
    const vp = viewportRef.current;
    const prevTotal = prevCandleCountRef.current;
    const wasAtEnd = vp.start + vp.count >= prevTotal - 0.5;

    if (total !== prevTotal) {
      if (prevTotal === 0 || vp.count >= prevTotal) {
        resetViewport(total);
      } else if (wasAtEnd) {
        viewportRef.current = clampViewport(
          { start: total - vp.count, count: vp.count },
          total,
        );
      } else {
        viewportRef.current = clampViewport(vp, total);
      }
      prevCandleCountRef.current = total;
    }

    scheduleDraw();
  }, [candles, candlesReady, currentSymbol, candleTimeframe, scheduleDraw, resetViewport]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || activeTab !== "Chart") return;

    const plotW = () => Math.max(1, container.clientWidth - PAD_RIGHT);
    const candleCount = () => liveRef.current.candles.length;

    const zoomAt = (clientX: number, direction: number) => {
      const total = candleCount();
      if (total === 0) return;
      const rect = container.getBoundingClientRect();
      const pw = plotW();
      const x = Math.min(Math.max(0, clientX - rect.left), pw);

      const vp = viewportRef.current;
      const anchor = candleAtX(x, pw, vp);
      const nextCount = vp.count * ZOOM_FACTOR ** direction;
      const count = Math.min(total, Math.max(MIN_VISIBLE_CANDLES, nextCount));
      const start = anchor - (x / pw) * count;

      viewportRef.current = clampViewport({ start, count }, total);
      scheduleDraw();
    };

    const onWheel = (e: WheelEvent) => {
      if (candleCount() === 0) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? -1 : 1;
      zoomAt(e.clientX, direction);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || candleCount() === 0) return;
      e.preventDefault();
      dragRef.current = { lastX: e.clientX };
      container.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent) => {
      const total = candleCount();
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const pw = plotW();
      const ph = Math.max(1, container.clientHeight - PAD_BOTTOM);

      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.lastX;
        dragRef.current.lastX = e.clientX;
        const vp = viewportRef.current;
        const delta = (-dx / pw) * vp.count;
        viewportRef.current = clampViewport(
          { start: vp.start + delta, count: vp.count },
          total,
        );
        if (hoverRef.current) {
          hoverRef.current = null;
          setHoverTooltip(null);
        }
        scheduleDraw();
        return;
      }

      if (x < 0 || x > pw || y < 0 || y > ph || total === 0) {
        if (hoverRef.current) {
          hoverRef.current = null;
          setHoverTooltip(null);
          scheduleDraw();
        }
        container.style.cursor = "crosshair";
        return;
      }

      const vp = viewportRef.current;
      const rawIndex = candleAtX(x, pw, vp);
      const index = Math.min(total - 1, Math.max(0, Math.round(rawIndex)));

      const next: HoverInfo = {
        index,
        clientX: e.clientX,
        clientY: e.clientY,
      };
      hoverRef.current = next;
      setHoverTooltip(next);
      container.style.cursor = "crosshair";
      scheduleDraw();
    };

    const onMouseUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        container.style.cursor = "crosshair";
      }
    };

    const onMouseLeave = () => {
      hoverRef.current = null;
      setHoverTooltip(null);
      if (!dragRef.current) container.style.cursor = "default";
      scheduleDraw();
    };

    const onDblClick = () => {
      resetViewport(candleCount());
      scheduleDraw();
    };

    const touchDist = (t: TouchList) => {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (candleCount() === 0) return;
      if (e.touches.length === 1) {
        pinchRef.current = null;
        dragRef.current = { lastX: e.touches[0].clientX };
      } else if (e.touches.length === 2) {
        dragRef.current = null;
        pinchRef.current = {
          dist: touchDist(e.touches),
          centerX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const total = candleCount();
      if (total === 0) return;

      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const dist = touchDist(e.touches);
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const ratio = pinchRef.current.dist / (dist || 1);
        const rect = container.getBoundingClientRect();
        const pw = plotW();
        const x = Math.min(Math.max(0, centerX - rect.left), pw);
        const vp = viewportRef.current;
        const anchor = candleAtX(x, pw, vp);
        const count = Math.min(
          total,
          Math.max(MIN_VISIBLE_CANDLES, vp.count * ratio),
        );
        const start = anchor - (x / pw) * count;
        viewportRef.current = clampViewport({ start, count }, total);
        pinchRef.current = { dist, centerX };
        scheduleDraw();
        return;
      }

      if (e.touches.length === 1 && dragRef.current) {
        e.preventDefault();
        const clientX = e.touches[0].clientX;
        const dx = clientX - dragRef.current.lastX;
        dragRef.current.lastX = clientX;
        const pw = plotW();
        const vp = viewportRef.current;
        const delta = (-dx / pw) * vp.count;
        viewportRef.current = clampViewport(
          { start: vp.start + delta, count: vp.count },
          total,
        );
        scheduleDraw();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        dragRef.current = null;
        pinchRef.current = null;
      } else if (e.touches.length === 1) {
        pinchRef.current = null;
        dragRef.current = { lastX: e.touches[0].clientX };
      }
    };

    const ro = new ResizeObserver(() => scheduleDraw());
    ro.observe(container);

    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("mouseleave", onMouseLeave);
    container.addEventListener("dblclick", onDblClick);
    container.addEventListener("touchstart", onTouchStart, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchEnd);

    return () => {
      ro.disconnect();
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("mouseleave", onMouseLeave);
      container.removeEventListener("dblclick", onDblClick);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [activeTab, scheduleDraw, resetViewport]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const tooltipCandle: Candle | null =
    hoverTooltip && hoverTooltip.index >= 0
      ? (candles[hoverTooltip.index] ?? null)
      : null;

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
        style={{
          cursor: activeTab === "Chart" ? "crosshair" : undefined,
          touchAction: activeTab === "Chart" ? "none" : undefined,
        }}
      >
        {activeTab === "Chart" ? (
          <>
            <canvas ref={canvasRef} className="absolute inset-0" />
            {tooltipCandle && hoverTooltip ? (
              <div
                className="pointer-events-none absolute z-10 rounded-lg border border-[var(--wr-border)] bg-[#0f1218ee] px-2.5 py-2 font-mono text-[10px] shadow-lg backdrop-blur-sm"
                style={{
                  left: Math.min(
                    hoverTooltip.clientX -
                      (containerRef.current?.getBoundingClientRect().left ?? 0) +
                      12,
                    (containerRef.current?.clientWidth ?? 0) - 148,
                  ),
                  top: Math.max(
                    8,
                    hoverTooltip.clientY -
                      (containerRef.current?.getBoundingClientRect().top ?? 0) -
                      88,
                  ),
                }}
              >
                <div className="mb-1 text-[11px] text-[var(--wr-text-secondary)]">
                  {formatCandleTime(tooltipCandle.t, candleTimeframe)}
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[var(--wr-text-muted)]">
                  <span>O</span>
                  <span className="text-[var(--wr-text)]">
                    {formatPrice(tooltipCandle.o, market.pricePrecision)}
                  </span>
                  <span>H</span>
                  <span className="text-[var(--wr-green)]">
                    {formatPrice(tooltipCandle.h, market.pricePrecision)}
                  </span>
                  <span>L</span>
                  <span className="text-[var(--wr-red)]">
                    {formatPrice(tooltipCandle.l, market.pricePrecision)}
                  </span>
                  <span>C</span>
                  <span
                    className={
                      tooltipCandle.c >= tooltipCandle.o
                        ? "text-[var(--wr-green)]"
                        : "text-[var(--wr-red)]"
                    }
                  >
                    {formatPrice(tooltipCandle.c, market.pricePrecision)}
                  </span>
                </div>
              </div>
            ) : null}
            <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-[#0c0e12aa] px-2 py-1 text-[10px] text-[var(--wr-text-dim)]">
              Scroll to zoom · drag to pan · double-click to reset
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--wr-text-dim)]">
            {activeTab} view
          </div>
        )}
      </div>
    </div>
  );
}
