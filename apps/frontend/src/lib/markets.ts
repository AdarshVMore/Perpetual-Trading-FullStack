import type { TradableSymbol } from "./types";

/** Backend engine market ids (e.g. BTCUSDT) ↔ frontend tradable symbols (BTCUSD). */
export const MARKET_ID_BY_SYMBOL: Record<TradableSymbol, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  SOLUSD: "SOLUSDT",
};

export const SYMBOL_BY_MARKET_ID: Record<string, TradableSymbol> = {
  BTCUSDT: "BTCUSD",
  ETHUSDT: "ETHUSD",
  SOLUSDT: "SOLUSD",
};

export function toMarketId(symbol: TradableSymbol): string {
  return MARKET_ID_BY_SYMBOL[symbol];
}

export function toTradableSymbol(marketId: string): TradableSymbol | null {
  return SYMBOL_BY_MARKET_ID[marketId] ?? null;
}
