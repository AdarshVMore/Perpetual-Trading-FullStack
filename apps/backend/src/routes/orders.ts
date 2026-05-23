// /create-order
// /cancle-order/:id
// /create-market
// /get-order/:id
// /get-fills/:marketId


import { Router } from "express";
import type { Response, Request } from "express";
import { authUserMiddleware, authAdminMiddleware } from "../middleware/auth";
import {createRedisConnection} from "../../../../packages/lib/redis-client"

const routes = Router()
const redisClient = createRedisConnection()

routes.post("/create-order", authUserMiddleware, async (req:Request, res:Response) => {
    const {userId, price, qty, marketId, orderType, positionType, leverage } = req.body
    


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