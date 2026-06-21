import z from "zod";

export const userSchemaValidation = z.object({
    email: z.email(),
    password: z.string()
})

export const CreateOrderSchema = z.object({
  // type:  z.enum(["create-order", "cancle-order", "get-order", "create-market"]),
  userId: z.string(),
  marketId: z.string(),
  price: z.number(),
  qty: z.number().positive(),
  leverage: z.number().min(1).max(100),
  orderType: z.enum(["MARKET", "LIMIT"]),
  positionType: z.enum(["LONG", "SHORT"])
});

export const getOrderSchema = z.object({
  // type:  z.enum(["create-order", "cancle-order", "get-order", "create-market"]),
  orderId: z.string(),
})

export const getFillsSchema = z.object({
  // type:  z.enum(["create-order", "cancle-order", "get-order", "create-market"]),
  marketId: z.string()
})

export const cancleOrdersSchema = z.object({
  // type:  z.enum(["create-order", "cancle-order", "get-order", "create-market"]),
  orderId: z.string()
})

export const createMarketSchema = z.object({
  // type:  z.enum(["create-order", "cancle-order", "get-order", "create-market"]),
  marketId: z.string(),
  marketName: z.string(),
  symbol: z.string(),
  maxLeverage: z.number().max(100)
})

  // userId, price, qty, marketId, orderType, positionType, leverage 