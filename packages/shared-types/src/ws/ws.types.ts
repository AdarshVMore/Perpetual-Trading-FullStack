import type { positionType, marketType, orderStatus } from "..";

export type WsRequests = SubscribeEvent | UnsubscribeEvent;

export type EngineCommands = CreateOrder | CancleOrder;

export type EngineEvents =
  | depthUpdates
  | tradeUpdates
  | positionUpdates
  | tickerUpdates;

type CreateOrder = {
  type: "cancle-order";
  orderId: string;
  userId: string;
  marketId: string;
};
type CancleOrder = {
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

export type depthUpdates = {
  type: "depth";
  market: string;
  asks: [];
  bids: [];
};
export type tradeUpdates = {
  type: "trades";
  market: string;
  asks: [];
  bids: [];
};
export type tickerUpdates = {
  type: "ticker";
  marketId: string;
  indexPrice: number;
};
export type positionUpdates = {
  type: "position";
  side: positionType;
  // marketType: marketType;
  marketId: string;
  price: number;
  qty: number;
  pnl: number;
  realisedPnL: number;
  // status: orderStatus;
};

type SubscribeEvent = {
  type: "SUBSCRIBE";
  channel: "depth" | "trade" | "position";
  market: string;
};
type UnsubscribeEvent = {
  type: "UNSUBSCRIBE";
  channel: "depth" | "trade" | "position";
  market: string;
};
