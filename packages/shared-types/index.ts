import {LinkList, OrderedMap} from "js-sdsl"

// ====================================================  ENUMS   =========================================================

type positionType = 'LONG' | 'SHORT' ;
type marketType = "MARKET" | "LIMIT"
type orderStatus = "OPEN" | "FILLED" | "PARTIAL_FILLED" | "CANCLE"

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
  positionType: positionType
  status: orderStatus;
  price: number;
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
  long: number;
  short: number;
}

export {
  userSchemaValidation,
  CreateOrderSchema,
  getOrderSchema,
  getFillsSchema,
  cancleOrdersSchema,
  createMarketSchema
} from "./zod/user.validation";