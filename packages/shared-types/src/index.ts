import {LinkList, OrderedMap} from "js-sdsl"

// ====================================================  ENUMS   =========================================================

export type positionType = 'LONG' | 'SHORT' ;
export type marketType = "MARKET" | "LIMIT"
export type orderStatus = "OPEN" | "FILLED" | "PARTIAL_FILLED" | "CANCLE"
export type dbPollerEvent = "OrderUpdate" | "TradeExecuted" | "FillsCreated" | "PositionUpdated"


// ====================================================  USERS   =========================================================

export type UserPositions = {
  marketId: string;
  positionType: positionType;
  qty: number;
  leverage: number;
  margin: number;
  maintainanceMargin: number;
  liquidationPrice: number;
  pnL: number;
  entryPrice:number;
  averagePrice: number;
  unrealisedPnL: number;
};

export type UserOrders = {
  orderId: string;
  marketId: string;
  positionType: positionType;
  qty: number;
  margin: number;
  leverage: number;
  orderType: string;
  price: number;
  filledQty: number;
  remainingQty: number;
  status: string;
};

export type User = {
  userId: string;
  collateral: {
    availabe: number;
    locked: number;
  };
  positions: UserPositions[];
  orders: UserOrders[];
};


// ====================================================  ORDERBOOK   =========================================================

export interface Order {
  orderId: string;
  userId: string;
  marketId: string;
  marketType: marketType;
  orderType: string;
  positionType: positionType
  status: orderStatus;
  price?: number;
  qty: number;
  leverage: number;
  remainingQty: number;
}

export interface SingleOrderBook {
  asks: OrderedMap<number, LinkList<Order>>;
  bids: OrderedMap<number, LinkList<Order>>;
  lastTradedPrice: number;
  indexPrice: number;
}

export interface OrderBooks {
  [marketId: string]: SingleOrderBook;
}

// ====================================================  FILLS   =========================================================

export interface Fills {
  maker: string;
  taker: string;
  marketId: string;
  qty: number;
  price: number;
}

// =================================================  BACKEND STREAM  ====================================================


export interface CreateMarket {
  marketId: string,
  marketName: string,
  symbol: string,
  maxLeverage: string

}

export interface CancleOrder {
  orderId: string
}


export interface BackendEvents {
    type: "create-order" | "cancle-order" | "create-market"
    data: Order | CreateMarket | CancleOrder
}



// ====================================================  DBPoller =======================================================

export interface CustomPosition {
  userId: string,
  position: UserPositions
}

export interface dbPollerEvents {
  type: dbPollerEvent,
  payload: dbPollerPayload
}

export interface dbPollerPayload {
  method: "POST" | "PUT" | "DELETE",
  data: Order | CustomPosition | Fills
}

// ====================================================  Zod =======================================================



export {
  userSchemaValidation,
  CreateOrderSchema,
  getOrderSchema,
  getFillsSchema,
  cancleOrdersSchema,
  createMarketSchema
} from "./zod/zod.validation"

export type {
  WsRequests,
  EngineCommands,
  EngineEvents,
  depthUpdates,
  tradeUpdates,
  positionUpdates,
  tickerUpdates,
  orderUpdates,
} from "./ws/ws.types"