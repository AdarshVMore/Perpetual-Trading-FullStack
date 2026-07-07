// Wire types mirroring @repo/shared-types. Kept local so the frontend bundle
// stays decoupled from the backend's zod schemas while matching them exactly.

export type TradableSymbol = "BTCUSD" | "SOLUSD" | "ETHUSD";
export type Side = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET";
export type MarginType = "ISOLATED" | "CROSS";
export type OrderStatus = "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED";
export type PositionType = "LONG" | "SHORT";

// ---- subscribable channels -------------------------------------------------

export type MarketEventType =
  | "depth.updated"
  | "trades.created"
  | "indexprice.updated"
  | "markprice.updated"
  | "lastTradedPrice.updated";

export type UserEventType = "userfill.created";

export type EngineEventType = MarketEventType | UserEventType;

// ---- request/response (matched by requestId) -------------------------------

export interface DepthSnapshot {
  asks: { price: number; quantity: number }[];
  bids: { price: number; quantity: number }[];
  lastUpdatedDepthId: number;
}

export interface BalanceSnapshot {
  balance: number;
  lockedBalance: number;
}

export interface WirePosition {
  userId: string;
  price: number;
  quantity: number;
  type: PositionType;
  marketSymbol: TradableSymbol;
  createdAt: string;
  margin: number;
  marginType: MarginType;
  liquidationPrice: number;
}

export interface PositionSnapshot {
  positions: Partial<Record<TradableSymbol, WirePosition>>;
  lastFillId: number;
}

export interface WireOrder {
  userId: string;
  orderId: string;
  price: number;
  quantity: number;
  filledQuantity: number;
  side: Side;
  marketSymbol: TradableSymbol;
  type: OrderType;
  margin: number;
  marginType: MarginType;
  status: OrderStatus;
}

// ---- streamed events -------------------------------------------------------

export interface DepthUpdateData {
  marketSymbol: TradableSymbol;
  lastUpdatedDepthId: number;
  depthUpdates: {
    asks: Record<string, number>;
    bids: Record<string, number>;
  };
}

export interface PriceUpdateData {
  marketSymbol: TradableSymbol;
  price: number;
}

export interface TradesCreatedData {
  marketSymbol: TradableSymbol;
  trades: WireTrade[];
}

export interface WireTrade {
  fillId: string;
  price: number;
  qty: number;
}

export interface UserFillData {
  userFillId: number;
  userId: string;
  fillId: string;
  orderId: string;
  marketSymbol: TradableSymbol;
  side: Side;
  price: number;
  qty: number;
  filledQty: number;
  totalQty: number;
  orderStatus: OrderStatus;
  balance: number;
  lockedBalance: number;
  position: WirePosition | null;
}

// ---- view models -----------------------------------------------------------

export interface UiPosition {
  marketSymbol: TradableSymbol;
  type: PositionType;
  quantity: number;
  entryPrice: number;
  margin: number;
  marginType: MarginType;
  liquidationPrice: number;
}

export interface UiOrder {
  orderId: string;
  side: Side;
  type: OrderType;
  price: number;
  quantity: number;
  filledQuantity: number;
  status: OrderStatus;
  marginType: MarginType;
  marketSymbol: TradableSymbol;
}

export interface UiFill {
  fillId: string;
  marketSymbol: TradableSymbol;
  side: Side;
  price: number;
  qty: number;
  status: OrderStatus;
  time: number;
}

export interface PublicTrade {
  fillId: string;
  price: number;
  qty: number;
  time: number;
  up: boolean;
}
