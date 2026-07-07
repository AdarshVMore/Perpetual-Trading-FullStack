import type {
  MarketEventType,
  TradableSymbol,
  UserEventType,
} from "./types";

export const API_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
export const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";

export interface MarketMeta {
  symbol: TradableSymbol;
  label: string;
  base: string;
  pricePrecision: number;
  qtyPrecision: number;
  /** Fallback when no live index/mark/trade price is available */
  referencePrice: number;
}

export const MARKETS: MarketMeta[] = [
  {
    symbol: "BTCUSD",
    label: "BTC-PERP",
    base: "BTC",
    pricePrecision: 2,
    qtyPrecision: 4,
    referencePrice: 95_000,
  },
  {
    symbol: "ETHUSD",
    label: "ETH-PERP",
    base: "ETH",
    pricePrecision: 2,
    qtyPrecision: 4,
    referencePrice: 3_500,
  },
  {
    symbol: "SOLUSD",
    label: "SOL-PERP",
    base: "SOL",
    pricePrecision: 2,
    qtyPrecision: 2,
    referencePrice: 150,
  },
];

export function getMarket(symbol: TradableSymbol): MarketMeta {
  return MARKETS.find((m) => m.symbol === symbol) ?? MARKETS[0];
}

/** Live prices only — no stale hardcoded fallback. */
export function resolveLivePrice(
  _symbol: TradableSymbol,
  live?: { last?: number; mark?: number; index?: number },
): number | undefined {
  return live?.index ?? live?.mark ?? live?.last;
}

/** Same priority as OrderForm: last → mark → index → market default. */
export function resolveReferencePrice(
  symbol: TradableSymbol,
  live?: { last?: number; mark?: number; index?: number },
): number {
  return resolveLivePrice(symbol, live) ?? getMarket(symbol).referencePrice;
}

// market-wide channels: just subscribe and stream
export const MARKET_EVENTS: MarketEventType[] = [
  "depth.updated",
  "trades.created",
  "indexprice.updated",
  "markprice.updated",
  "lastTradedPrice.updated",
];

// personal channel: routed by the backend only to the owning user
export const USER_EVENTS: UserEventType[] = ["userfill.created"];

export const ALL_EVENTS = [...MARKET_EVENTS, ...USER_EVENTS];
