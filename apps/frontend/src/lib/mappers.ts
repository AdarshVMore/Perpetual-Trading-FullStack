import type { OpenOrder } from "./api";
import { toTradableSymbol } from "./markets";
import type {
  OrderStatus,
  OrderType,
  PositionType,
  Side,
  UiFill,
  UiPosition,
} from "./types";

export function toEmail(username: string): string {
  return username.includes("@") ? username : `${username}@perp.local`;
}

export function positionTypeToSide(positionType: PositionType): Side {
  return positionType === "LONG" ? "BUY" : "SELL";
}

export function sideToPositionType(side: Side): PositionType {
  return side === "BUY" ? "LONG" : "SHORT";
}

export function mapOrderStatus(status: string): OrderStatus {
  switch (status) {
    case "PARTIAL_FILLED":
    case "PARTIALLY_FILLED":
      return "PARTIALLY_FILLED";
    case "CANCLE":
    case "CANCLED":
      return "CANCELLED";
    case "FILLED":
      return "FILLED";
    case "OPEN":
    default:
      return "OPEN";
  }
}

export function mapBackendOrder(  order: {
  id: string;
  marketId: string;
  positionType: PositionType;
  orderType: OrderType;
  price: number | null;
  qty: number;
  remainingQty: number;
  orderStatus: string;
  leverage?: number;
}): OpenOrder | null {
  const marketSymbol = toTradableSymbol(order.marketId);
  if (!marketSymbol) return null;
  const filledQuantity = order.qty - order.remainingQty;
  return {
    orderId: order.id,
    side: positionTypeToSide(order.positionType),
    type: order.orderType,
    price: order.price ?? 0,
    quantity: order.qty,
    filledQuantity,
    status: mapOrderStatus(order.orderStatus),
    marginType: "ISOLATED",
    marketSymbol,
    leverage: order.leverage ?? 10,
  };
}

export function mapBackendPosition(position: {
  marketId: string;
  positionType: PositionType;
  qty: number;
  entryPrice: number;
  margin: number;
  liquidationPrice: number;
}): UiPosition | null {
  const marketSymbol = toTradableSymbol(position.marketId);
  if (!marketSymbol) return null;
  return {
    marketSymbol,
    type: position.positionType,
    quantity: position.qty,
    entryPrice: position.entryPrice,
    margin: position.margin,
    marginType: "ISOLATED",
    liquidationPrice: position.liquidationPrice,
  };
}

export function mapBackendFill(
  fill: {
    id: string;
    marketId: string;
    price: number;
    filledQty: number;
    createdAt: string;
    orderId: string;
  },
  orderSide?: Side,
): UiFill | null {
  const marketSymbol = toTradableSymbol(fill.marketId);
  if (!marketSymbol) return null;
  return {
    fillId: fill.id,
    marketSymbol,
    side: orderSide ?? "BUY",
    price: fill.price,
    qty: fill.filledQty,
    status: "FILLED",
    time: new Date(fill.createdAt).getTime(),
  };
}
