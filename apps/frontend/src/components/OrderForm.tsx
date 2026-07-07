import { useEffect, useMemo, useState } from "react";
import { useTrading } from "../context/TradingContext";
import { getMarket } from "../lib/constants";
import { formatUsd } from "../lib/format";
import type { MarginType, OrderType, Side } from "../lib/types";

const LEVERAGES = [1, 3, 5, 10, 20, 50];
const FAUCET = [100, 1000, 10000];
const MARKET_SLIPPAGE = 0.01;

interface OrderFormProps {
  onOpenAuth: (mode: "signin" | "signup") => void;
}

export function OrderForm({ onOpenAuth }: OrderFormProps) {
  const {
    isAuthenticated,
    connected,
    currentSymbol,
    markPrice,
    lastPrice,
    indexPrice,
    orderbook,
    balance,
    placeOrder,
    addBalance,
  } = useTrading();

  const market = getMarket(currentSymbol);

  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [marginType, setMarginType] = useState<MarginType>("ISOLATED");
  const [leverage, setLeverage] = useState(10);
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [sliderPct, setSliderPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const limitPrice = parseFloat(price) || 0;
  const bookMid =
    orderbook.asks[0]?.[0] != null && orderbook.bids[0]?.[0] != null
      ? (orderbook.asks[0][0] + orderbook.bids[0][0]) / 2
      : null;
  const basePrice =
    lastPrice ??
    markPrice ??
    indexPrice ??
    bookMid ??
    (limitPrice > 0 ? limitPrice : null);

  useEffect(() => {
    if (orderType === "LIMIT" && !price && basePrice) {
      setPrice(basePrice.toFixed(market.pricePrecision));
    }
  }, [orderType, basePrice, price, market.pricePrecision]);

  const submitPrice =
    orderType === "MARKET" && basePrice != null
      ? side === "BUY"
        ? basePrice * (1 + MARKET_SLIPPAGE)
        : basePrice * (1 - MARKET_SLIPPAGE)
      : limitPrice;
  const displayPrice = orderType === "MARKET" ? basePrice ?? 0 : limitPrice;
  const sizingPrice = submitPrice > 0 ? submitPrice : displayPrice;
  const qtyNum = parseFloat(qty) || 0;
  const orderValue = displayPrice * qtyNum;
  const marginRequired =
    leverage > 0 ? (submitPrice * qtyNum) / leverage : 0;
  const buyingPower = balance.available * leverage;

  const estLiqPrice = useMemo(() => {
    if (submitPrice <= 0 || leverage <= 1) return null;
    return side === "BUY"
      ? submitPrice * (1 - 1 / leverage)
      : submitPrice * (1 + 1 / leverage);
  }, [submitPrice, leverage, side]);

  const applySlider = (pct: number) => {
    setSliderPct(pct);
    if (sizingPrice <= 0) return;
    const target = buyingPower * (pct / 100);
    setQty((target / sizingPrice).toFixed(market.qtyPrecision));
  };

  const onQtyChange = (val: string) => {
    setQty(val);
    const q = parseFloat(val) || 0;
    if (sizingPrice <= 0 || buyingPower <= 0) {
      setSliderPct(0);
      return;
    }
    setSliderPct(
      Math.min(100, Math.round(((q * sizingPrice) / buyingPower) * 100)),
    );
  };

  const submit = async () => {
    if (!isAuthenticated || submitting) return;
    setFormError(null);

    if (orderType === "MARKET" && !basePrice) {
      setFormError("Waiting for price feed");
      return;
    }
    if (submitPrice <= 0) {
      setFormError("Enter a valid price");
      return;
    }
    if (qtyNum <= 0) {
      setFormError("Enter a valid quantity");
      return;
    }
    if (marginRequired > balance.available) {
      setFormError("Insufficient equity — use the faucet");
      return;
    }

    setSubmitting(true);
    await placeOrder({
      side,
      type: orderType,
      price: submitPrice,
      qty: qtyNum,
      margin: parseFloat(marginRequired.toFixed(4)),
      marginType,
      leverage,
    });
    setSubmitting(false);
    setQty("");
    setSliderPct(0);
  };

  return (
    <div className="wr-card flex h-full flex-col p-3">
      {/* Margin mode + leverage toggles */}
      <div className="mb-3 flex items-center gap-2">
        <div className="wr-input flex flex-1 rounded-xl p-0.5">
          {(["ISOLATED", "CROSS"] as MarginType[]).map((m) => (
            <button
              key={m}
              onClick={() => setMarginType(m)}
              className={`flex-1 rounded-[10px] py-1.5 text-[11px] font-semibold capitalize transition-all ${
                marginType === m
                  ? "bg-[var(--wr-green-glow)] text-[var(--wr-green)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "text-[var(--wr-text-muted)] hover:text-[var(--wr-text-secondary)]"
              }`}
            >
              {m.toLowerCase()}
            </button>
          ))}
        </div>
        <select
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="wr-input-select px-3 py-2 text-xs font-bold text-[var(--wr-green)] outline-none"
        >
          {LEVERAGES.map((l) => (
            <option key={l} value={l}>
              {l}x
            </option>
          ))}
        </select>
      </div>

      {/* Long / Short */}
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        <button
          onClick={() => setSide("BUY")}
          className={`rounded-xl py-2.5 text-sm font-bold transition-all ${
            side === "BUY"
              ? "wr-btn-primary"
              : "wr-input border text-[var(--wr-green)] hover:border-[var(--wr-green)]/30"
          }`}
        >
          Long
        </button>
        <button
          onClick={() => setSide("SELL")}
          className={`rounded-xl py-2.5 text-sm font-bold transition-all ${
            side === "SELL"
              ? "wr-btn-danger"
              : "wr-input border text-[var(--wr-red)] hover:border-[var(--wr-red)]/30"
          }`}
        >
          Short
        </button>
      </div>

      {/* Order type tabs */}
      <div className="mb-3 flex gap-1 text-[13px] font-medium">
        {(["MARKET", "LIMIT"] as OrderType[]).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={`rounded-lg px-2.5 py-1 capitalize transition-colors ${
              orderType === t
                ? "wr-pill-active text-[var(--wr-green)]"
                : "text-[var(--wr-text-muted)] hover:text-[var(--wr-text-secondary)]"
            }`}
          >
            {t.toLowerCase()}
          </button>
        ))}
        <span className="cursor-not-allowed rounded-lg px-2.5 py-1 text-[var(--wr-text-dim)]">
          Conditional
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        <Field label="Order Price" suffix="USD">
          <input
            inputMode="decimal"
            disabled={orderType === "MARKET"}
            value={orderType === "MARKET" ? "Market" : price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent font-mono text-sm text-white outline-none placeholder:text-[var(--wr-text-dim)] disabled:text-[var(--wr-text-muted)]"
          />
        </Field>

        <Field label="Position Amount" suffix={market.base}>
          <input
            inputMode="decimal"
            value={qty}
            onChange={(e) => onQtyChange(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent font-mono text-sm text-white outline-none placeholder:text-[var(--wr-text-dim)]"
          />
        </Field>

        <div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={sliderPct}
            onChange={(e) => applySlider(Number(e.target.value))}
            className="w-full"
          />
          <div className="mt-1 flex justify-between text-[10px] font-mono text-[var(--wr-text-dim)]">
            {[0, 25, 50, 75, 100].map((p) => (
              <button
                key={p}
                onClick={() => applySlider(p)}
                className="hover:text-[var(--wr-green)]"
              >
                {p}%
              </button>
            ))}
          </div>
        </div>

        <Field label="Order Value" suffix="USD">
          <span className="w-full font-mono text-sm text-[var(--wr-text-secondary)]">
            {orderValue > 0 ? orderValue.toFixed(2) : "0.00"}
          </span>
        </Field>

        {formError && (
          <div className="rounded-xl border border-[var(--wr-red)]/30 bg-[var(--wr-red-glow)] px-2.5 py-1.5 text-[11px] text-[var(--wr-red)]">
            {formError}
          </div>
        )}

        {/* Margin usage table */}
        <div className="wr-card-inset space-y-2 p-3 text-[11px]">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--wr-text-dim)]">
            Margin Usage
          </div>
          <MarginRow label="Available Equity" value={formatUsd(balance.available)} />
          {balance.locked > 0 && (
            <MarginRow
              label="Locked Margin"
              value={formatUsd(balance.locked)}
              valueClass="text-[var(--wr-amber)]"
            />
          )}
          <MarginRow label="Margin Required" value={formatUsd(marginRequired)} />
          <MarginRow
            label="Est. Liquidation Price"
            value={estLiqPrice ? formatUsd(estLiqPrice) : "—"}
            valueClass="text-[var(--wr-amber)]"
          />
          {orderType === "MARKET" && (
            <MarginRow label="Max Slippage" value="1%" />
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {isAuthenticated ? (
          <button
            onClick={submit}
            disabled={submitting || !connected}
            className={`w-full py-3 text-sm disabled:opacity-50 ${
              side === "BUY" ? "wr-btn-primary" : "wr-btn-danger"
            }`}
          >
            {submitting
              ? "Submitting…"
              : side === "BUY"
                ? "Place Long Order"
                : "Place Short Order"}
          </button>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => onOpenAuth("signup")}
              className="wr-btn-primary w-full py-3 text-sm"
            >
              Sign up to trade
            </button>
            <button
              onClick={() => onOpenAuth("signin")}
              className="w-full rounded-xl border border-[var(--wr-border)] bg-black/30 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--wr-card-hover)]"
            >
              Log in to trade
            </button>
          </div>
        )}

        {isAuthenticated && (
          <div className="wr-card-inset p-2.5">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--wr-green)]">
              Testnet USD Faucet
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {FAUCET.map((amt) => (
                <button
                  key={amt}
                  onClick={() => void addBalance(amt)}
                  className="rounded-lg bg-black/40 py-1.5 font-mono text-[11px] font-bold text-white transition-colors hover:bg-[var(--wr-card-hover)]"
                >
                  +${amt >= 1000 ? `${amt / 1000}K` : amt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <span className="text-[11px] font-medium text-[var(--wr-text-muted)]">
        {label}
      </span>
      <div className="wr-input flex items-center gap-2 px-3.5 py-3">
        <div className="min-w-0 flex-1">{children}</div>
        <span className="shrink-0 rounded-md bg-black/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--wr-text-dim)]">
          {suffix}
        </span>
      </div>
    </div>
  );
}

function MarginRow({
  label,
  value,
  valueClass = "text-[var(--wr-text-secondary)]",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--wr-text-dim)]">{label}</span>
      <span className={`font-mono font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}
