import type { positionType, marketType, orderStatus } from "..";

export type WsRequests = SubscribeEvent | UnsubscribeEvent;

export type EngineCommands = CreateOrder | CancleOrder;

export type EngineEvents =
  | depthUpdates
  | tradeUpdates
  | positionUpdates
  | tickerUpdates
  | orderUpdates;

type CreateOrder = {
  type: "create-order";
  orderId: string;
  userId: string;
  marketId: string;
  marketType: marketType;
  positionType: positionType;
  status: orderStatus;
  price: number;
  qty: number;
  leverage: number;
  remainingQty: number;
};
type CancleOrder = {
  type: "cancle-order";
  orderId: string;
  userId: string;
  marketId: string;
  price: number;
  qty: number;
  leverage: number;
  orderType: marketType;
  positionType: positionType;
};

export type depthUpdates = {
  type: "depth";
  market: string;
  asks: [number, number][];
  bids: [number, number][];
};
export type tradeUpdates = {
  type: "trades";
  marketId: string;
  price: number;
  qty: number;
  maker: string;
  taker: string;
  timestamp: number;
};
export type tickerUpdates = {
  type: "ticker";
  marketId: string;
  indexPrice: number;
  markPrice?: number;
  fundingRate?: number;
};
export type positionUpdates = {
  type: "position";
  side: positionType;
  marketId: string;
  price: number;
  qty: number;
  pnl: number;
  realisedPnL: number;
  unrealisedPnL: number;
};
export type orderUpdates = {
  type: "orderCreate" | "orderUpdate";
  orderId: string;
  userId: string;
  marketId: string;
  positionType: positionType;
  price?: number;
  qty: number;
  remainingQty: number;
  leverage: number;
  status: orderStatus;
};

type SubscribeEvent = {
  type: "SUBSCRIBE";
  channel: "depth" | "trade" | "position" | "ticker" | "order";
  market: string;
  userId?: string;
};
type UnsubscribeEvent = {
  type: "UNSUBSCRIBE";
  channel: "depth" | "trade" | "position" | "ticker" | "order";
  market: string;
  userId?: string;
};
