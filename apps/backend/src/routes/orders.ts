// /create-order
// /cancle-order/:id
// /create-market
// /get-order/:id
// /get-fills/:marketId


import { Router } from "express";
import type { Response, Request } from "express";
import { authUserMiddleware, authAdminMiddleware } from "../middleware/auth";
import {createRedisConnection} from "@redis-client"
import {prisma} from "@prisma-db"

import type { RedisClientType } from "redis";

const routes = Router()

routes.post("/create-order", authUserMiddleware, async (req:Request, res:Response) => {
    const {userId, price, qty, marketId, orderType, positionType, leverage } = req.body
    const redisClient =  await createRedisConnection()
    if(!redisClient){
        console.log("")
        return
    }

    const res1 = redisClient.XADD("new-name", "*", {'price': price, 'qty': qty, 'orderType': orderType})
    console.log("added to new-name... ",res1)
})
routes.post("/cancle-order/:orderId",authUserMiddleware, (req:Request, res:Response) => {
    const orderId = req.params.orderId
})
routes.post("/create-market",authAdminMiddleware, (req:Request, res:Response) => {
    const {marketName, maxLeverage} = req.body
})
routes.get("/get-order/:orderId", authUserMiddleware, (req:Request, res:Response) => {
    const orderId = req.params.orderId
})
routes.get("/get-fills/:marketId", authUserMiddleware, (req:Request, res:Response) => {
    const marketId = req.params.marketId
})

export default routes