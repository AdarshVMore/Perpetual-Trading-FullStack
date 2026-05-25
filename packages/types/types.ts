type UserPositions = {
  market: string;
  type: string;
  qty: number;
  leverage: number;
  margin: number;
  maintainanceMargin: number;
  liquidationPrice: number;
  pnL: number;
  averagePrice: number;
  unrealisedPnL: number;
};

type UserOrders = {
  orderId: string;
  market: string;
  type: string;
  qty: number;
  margin: number;
  leverage: number;
  orderType: string;
  price: number;
  filledQty: number;
  remainingQty: number;
  status: string;
};

type User = {
  userId: string;
  username: string;
  password: string;
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
  price: number;
  qty: number;
  remainingQty: number;
  userId: string;
  market_id: string;
  status: "Opened";
  side: "BUY" | "SELL";
}

export interface SingleOrderBook {
  asks: Map<number, LinkedList>;
  bids: Map<number, LinkedList>;
  sortedBidPrices: number[];
  sortedAskPrices: number[];
  orderMap: Map<string, Node>;
  lastTradedPrice: number;
  indexPrice: number;
}

export interface OrderBooks {
  [market: string]: SingleOrderBook;
}


// ====================================================  ORDERBOOK   =========================================================


interface Fills {
  maker: string;
  taker: string;
  market: string;
  qty: number;
  price: number;
  long: number;
  short: number;
}